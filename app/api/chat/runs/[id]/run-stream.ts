import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { safeFileName } from "@/lib/chat-files";
import {
  resumeAgentState,
  runDeepSeekAgentUntilPause,
  type AgentExecutionState,
} from "@/lib/deepseek/agent";
import type { ModelPreset } from "@/lib/models";
import { appendReasoningDelta, completeReasoningBlock, type ReasoningBlock } from "@/lib/reasoning-block";
import { encodeStreamEvent } from "@/lib/streaming";
import { finalizeConversationTitle } from "@/lib/title-finalization";
import { type PythonToolActivity, type ToolActivity, upsertToolActivity } from "@/lib/tool-activity";
import { parseApiKeys } from "@/lib/web/key-failover";

type AgentRun = Database["public"]["Tables"]["agent_runs"]["Row"];

interface RunStreamOptions {
  request: Request;
  supabase: SupabaseClient<Database>;
  run: AgentRun;
  state: AgentExecutionState;
  preset: ModelPreset;
  title: string;
  titleFinalizedAt: string | null;
  activities: ToolActivity[];
  reasoningBlocks: ReasoningBlock[];
}

function asJson(value: unknown) { return value as Json; }

export function createAgentRunStream(options: RunStreamOptions) {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const startedAt = new Date(options.run.created_at).getTime();
  let outputOpen = true;

  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      let activities = options.activities;
      let reasoningBlocks = options.reasoningBlocks;
      const heartbeat = setInterval(() => {
        if (!options.run.lease_token || controller.signal.aborted) return;
        void options.supabase.from("agent_runs").update({
          lease_expires_at: new Date(Date.now() + 90_000).toISOString(),
        }).eq("id", options.run.id).eq("status", "streaming")
          .eq("version", options.run.version).eq("lease_token", options.run.lease_token)
          .select("id").maybeSingle().then(({ data, error }) => {
            if (!error && !data) controller.abort();
          });
      }, 30_000);
      options.request.signal.addEventListener("abort", () => controller.abort(), { once: true });
      const send = (event: Parameters<typeof encodeStreamEvent>[0]) => {
        if (!outputOpen) return;
        try { output.enqueue(encoder.encode(encodeStreamEvent(event))); }
        catch { outputOpen = false; controller.abort(); }
      };
      const close = () => {
        if (!outputOpen) return;
        outputOpen = false;
        try { output.close(); } catch { /* client disconnected */ }
      };
      const saveActivity = (activity: ToolActivity) => {
        activities = upsertToolActivity(activities, activity);
        send({ type: "tool_activity", activity });
      };

      const persistTransition = async (
        state: AgentExecutionState,
        runStatus: "awaiting_python" | "completed" | "stopped" | "error",
        messageStatus: "awaiting_tool" | "completed" | "stopped" | "error",
        pendingCall: unknown = null,
        pendingToken: string | null = null,
        errorMessage: string | null = null,
      ) => {
        if (!options.run.lease_token) throw new Error("The run lease is unavailable.");
        const { data, error } = await options.supabase.rpc("persist_agent_run_transition", {
          p_run_id: options.run.id,
          p_lease_token: options.run.lease_token,
          p_version: options.run.version,
          p_run_status: runStatus,
          p_provider_state: runStatus === "awaiting_python" ? asJson(state) : {},
          p_pending_tool_call: pendingCall === null ? null : asJson(pendingCall),
          p_pending_call_token: pendingToken,
          p_content: state.content,
          p_reasoning: state.reasoning,
          p_reasoning_blocks: asJson(reasoningBlocks),
          p_tool_activity: asJson(activities),
          p_message_status: messageStatus,
          p_duration_ms: Math.max(0, Date.now() - startedAt),
          p_tool_round_count: state.toolRounds,
          p_python_execution_count: state.pythonExecutions,
          p_error: errorMessage,
        });
        if (error || !data) throw new Error("The run lease changed before its state could be saved.");
      };

      send({
        type: "meta", conversationId: options.run.conversation_id,
        userMessageId: options.run.user_message_id,
        assistantMessageId: options.run.assistant_message_id!, title: options.title,
      });

      void (async () => {
        let state = options.state;
        try {
          if (!process.env.DEEPSEEK_API_KEY) throw new Error("DeepSeek is not configured.");
          while (true) {
            const outcome = await runDeepSeekAgentUntilPause({
              apiKey: process.env.DEEPSEEK_API_KEY,
              preset: options.preset,
              messages: state.messages,
              braveKeys: parseApiKeys(process.env.BRAVE_SEARCH_API_KEYS),
              tavilyKeys: parseApiKeys(process.env.TAVILY_API_KEYS),
              signal: controller.signal,
              onReasoning(delta, roundIndex) {
                reasoningBlocks = appendReasoningDelta(reasoningBlocks, roundIndex, delta);
                send({ type: "reasoning_delta", roundIndex, delta });
              },
              onReasoningComplete(roundIndex, durationMs) {
                reasoningBlocks = completeReasoningBlock(reasoningBlocks, roundIndex, durationMs);
                send({ type: "reasoning_round_complete", roundIndex, durationMs });
              },
              onContent(delta) { send({ type: "content_delta", delta }); },
              onActivity: saveActivity,
            }, state);
            state = outcome.state;
            if (outcome.status === "completed") break;

            const { data: inputs } = outcome.request.inputFileIds.length
              ? await options.supabase.from("chat_files")
                .select("id,object_path,original_name,mime_type,size_bytes")
                .eq("agent_run_id", options.run.id).eq("kind", "input")
                .in("id", outcome.request.inputFileIds)
              : { data: [] };
            if ((inputs ?? []).length !== outcome.request.inputFileIds.length) {
              state = resumeAgentState(
                state, outcome.request.callId,
                JSON.stringify({ error: "A requested input file is not attached to this chat turn." }),
              );
              continue;
            }

            const callToken = crypto.randomUUID();
            const activity: PythonToolActivity = {
              id: outcome.request.callId, kind: "python", provider: "pyodide",
              status: "running", phase: "queued", code: outcome.request.code,
              packages: outcome.request.packages, installed_packages: [], stdout: "", stderr: "",
              artifacts: [], round_index: Math.max(0, state.toolRounds - 1),
              started_at: new Date().toISOString(),
            };
            saveActivity(activity);
            await persistTransition(
              state, "awaiting_python", "awaiting_tool", outcome.request, callToken,
            );
            send({
              type: "python_request", runId: options.run.id, callToken,
              request: outcome.request,
              inputs: (inputs ?? []).map((file) => ({
                fileId: file.id, objectPath: file.object_path,
                path: `${file.id}-${safeFileName(file.original_name)}`,
                name: file.original_name, mimeType: file.mime_type, sizeBytes: file.size_bytes,
              })),
            });
            return;
          }

          const durationMs = Math.max(0, Date.now() - startedAt);
          await persistTransition(state, "completed", "completed");
          if (!options.titleFinalizedAt) {
            const { data: messages } = await options.supabase.from("messages")
              .select("role,content").eq("conversation_id", options.run.conversation_id)
              .in("status", ["completed", "stopped"]).order("created_at", { ascending: true });
            const title = messages && await finalizeConversationTitle({
              supabase: options.supabase, conversationId: options.run.conversation_id,
              messages, apiKey: process.env.DEEPSEEK_API_KEY,
            });
            if (title) send({ type: "title", conversationId: options.run.conversation_id, title });
          }
          send({ type: "done", durationMs, status: "completed" });
        } catch (caught) {
          const stopped = controller.signal.aborted || options.request.signal.aborted;
          const error = caught instanceof Error ? caught.message : "DeepSeek could not complete the response.";
          try {
            await persistTransition(
              state, stopped ? "stopped" : "error", stopped ? "stopped" : "error",
              null, null, error.slice(0, 4_000),
            );
          } catch { /* A recovered client may already own the fenced run. */ }
          if (stopped) send({ type: "done", durationMs: Math.max(0, Date.now() - startedAt), status: "stopped" });
          else send({ type: "error", message: error });
        } finally {
          clearInterval(heartbeat);
          close();
        }
      })();
    },
    cancel() { controller.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    },
  });
}
