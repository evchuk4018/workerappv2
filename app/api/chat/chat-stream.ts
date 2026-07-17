import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { runDeepSeekAgent } from "@/lib/deepseek/agent";
import type { ModelPreset } from "@/lib/models";
import { appendReasoningDelta, completeReasoningBlock, type ReasoningBlock } from "@/lib/reasoning-block";
import { encodeStreamEvent } from "@/lib/streaming";
import type { ConversationMessage, ProviderMessage } from "@/lib/system-prompt";
import { finalizeConversationTitle } from "@/lib/title-finalization";
import { type ToolActivity, upsertToolActivity } from "@/lib/tool-activity";

interface ChatStreamOptions {
  request: Request;
  supabase: SupabaseClient<Database>;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  title: string;
  titleFinalizedAt: string | null;
  titleMessages: ConversationMessage[];
  providerMessages: ProviderMessage[];
  preset: ModelPreset;
  deepSeekKey: string | undefined;
  braveKeys: readonly string[];
  tavilyKeys: readonly string[];
}

export function createChatStream(options: ChatStreamOptions): Response {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const upstreamController = new AbortController();
  const abortUpstream = () => upstreamController.abort();
  let currentTitle = options.title;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let content = "";
      let reasoning = "";
      let reasoningBlocks: ReasoningBlock[] = [];
      let activities: ToolActivity[] = [];
      let activityWrites = Promise.resolve();
      let outputOpen = true;
      options.request.signal.addEventListener("abort", abortUpstream, { once: true });
      if (options.request.signal.aborted) upstreamController.abort();

      const send = (event: Parameters<typeof encodeStreamEvent>[0]) => {
        if (!outputOpen) return;
        try {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
        } catch {
          outputOpen = false;
          upstreamController.abort();
        }
      };
      const close = () => {
        if (!outputOpen) return;
        outputOpen = false;
        try { controller.close(); } catch { /* The client already closed the stream. */ }
      };

      send({
        type: "meta",
        conversationId: options.conversationId,
        userMessageId: options.userMessageId,
        assistantMessageId: options.assistantMessageId,
        title: currentTitle,
      });

      void (async () => {
        if (!options.deepSeekKey) {
          await options.supabase.from("messages")
            .update({ status: "error", duration_ms: Date.now() - startedAt })
            .eq("id", options.assistantMessageId);
          send({ type: "error", message: "DeepSeek is not configured." });
          close();
          return;
        }

        try {
          const result = await runDeepSeekAgent({
            apiKey: options.deepSeekKey,
            preset: options.preset,
            messages: options.providerMessages,
            braveKeys: options.braveKeys,
            tavilyKeys: options.tavilyKeys,
            signal: upstreamController.signal,
            onReasoning(delta, roundIndex) {
              reasoning += delta;
              reasoningBlocks = appendReasoningDelta(reasoningBlocks, roundIndex, delta);
              send({ type: "reasoning_delta", roundIndex, delta });
            },
            onReasoningComplete(roundIndex, durationMs) {
              reasoningBlocks = completeReasoningBlock(reasoningBlocks, roundIndex, durationMs);
              send({ type: "reasoning_round_complete", roundIndex, durationMs });
            },
            onContent(delta) { content += delta; send({ type: "content_delta", delta }); },
            onActivity(activity) {
              activities = upsertToolActivity(activities, activity);
              send({ type: "tool_activity", activity });
              if (activity.status === "running") return;
              const snapshot = activities;
              activityWrites = activityWrites.then(async () => {
                await options.supabase.from("messages").update({ tool_activity: snapshot })
                  .eq("id", options.assistantMessageId).eq("status", "streaming");
              });
            },
          });
          content = result.content;
          reasoning = result.reasoning;
          await activityWrites;

          const durationMs = Date.now() - startedAt;
          await options.supabase.from("messages").update({
            content,
            reasoning_content: reasoning,
            reasoning_blocks: reasoningBlocks,
            tool_activity: activities,
            status: "completed",
            duration_ms: durationMs,
          }).eq("id", options.assistantMessageId).eq("status", "streaming");

          if (!options.titleFinalizedAt) {
            const finalizedTitle = await finalizeConversationTitle({
              supabase: options.supabase,
              conversationId: options.conversationId,
              messages: [...options.titleMessages, { role: "assistant", content }],
              apiKey: options.deepSeekKey,
            });
            if (finalizedTitle) {
              currentTitle = finalizedTitle;
              send({ type: "title", conversationId: options.conversationId, title: finalizedTitle });
            }
          }
          send({ type: "done", durationMs, status: "completed" });
        } catch (caught) {
          const durationMs = Date.now() - startedAt;
          const stopped = upstreamController.signal.aborted || options.request.signal.aborted;
          await activityWrites;
          await options.supabase.from("messages").update({
            content,
            reasoning_content: reasoning,
            reasoning_blocks: reasoningBlocks,
            tool_activity: activities,
            status: stopped ? "stopped" : "error",
            duration_ms: durationMs,
          }).eq("id", options.assistantMessageId).eq("status", "streaming");
          if (stopped) send({ type: "done", durationMs, status: "stopped" });
          else send({ type: "error", message: caught instanceof Error ? caught.message : "DeepSeek could not complete the response." });
        } finally {
          options.request.signal.removeEventListener("abort", abortUpstream);
          close();
        }
      })();
    },
    cancel() { upstreamController.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

