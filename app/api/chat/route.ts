import { runDeepSeekAgent } from "@/lib/deepseek/agent";
import { isModelPreset } from "@/lib/models";
import { encodeStreamEvent } from "@/lib/streaming";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { buildProviderMessages } from "@/lib/system-prompt";
import { titleFromMessage } from "@/lib/title";
import { finalizeConversationTitle } from "@/lib/title-finalization";
import { type ToolActivity, upsertToolActivity } from "@/lib/tool-activity";
import { parseApiKeys } from "@/lib/web/key-failover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  conversationId?: string | null;
  message?: string;
  preset?: unknown;
}

export async function POST(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message || message.length > 100_000 || !isModelPreset(body.preset)) {
    return Response.json({ error: "A valid message and model preset are required." }, { status: 400 });
  }

  const supabase = auth.supabase;
  let conversationId = body.conversationId ?? null;
  let title = titleFromMessage(message);
  let titleFinalizedAt: string | null = null;
  let systemPrompt = "";

  if (conversationId) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id,title,title_finalized_at,system_prompt")
      .eq("id", conversationId)
      .maybeSingle();
    if (!existing) return Response.json({ error: "Chat not found." }, { status: 404 });
    title = existing.title;
    titleFinalizedAt = existing.title_finalized_at;
    systemPrompt = existing.system_prompt;
  } else {
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("system_prompt")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (settingsError) {
      return Response.json({ error: "Unable to load settings." }, { status: 500 });
    }
    systemPrompt = settings?.system_prompt ?? "";

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ user_id: auth.user.id, title, system_prompt: systemPrompt })
      .select("id,title,title_finalized_at")
      .single();
    if (error || !created) {
      return Response.json({ error: "Unable to create the chat." }, { status: 500 });
    }
    conversationId = created.id;
    title = created.title;
    titleFinalizedAt = created.title_finalized_at;
  }

  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .in("status", ["completed", "stopped"])
    .order("created_at", { ascending: true });
  if (historyError) return Response.json({ error: "Unable to load chat history." }, { status: 500 });

  const { data: userMessage, error: userError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: message, status: "completed" })
    .select("id")
    .single();
  if (userError || !userMessage) {
    return Response.json({ error: "Unable to save the message." }, { status: 500 });
  }

  const { data: assistantMessage, error: assistantError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      reasoning_content: "",
      model_preset: body.preset,
      status: "streaming",
    })
    .select("id")
    .single();
  if (assistantError || !assistantMessage) {
    return Response.json({ error: "Unable to prepare the response." }, { status: 500 });
  }

  const deepSeekKey = process.env.DEEPSEEK_API_KEY;
  const braveKeys = parseApiKeys(process.env.BRAVE_SEARCH_API_KEYS);
  const tavilyKeys = parseApiKeys(process.env.TAVILY_API_KEYS);
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stableConversationId = conversationId;
  const preset = body.preset;
  const upstreamController = new AbortController();
  const abortUpstream = () => upstreamController.abort();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let content = "";
      let reasoning = "";
      let activities: ToolActivity[] = [];
      let activityWrites = Promise.resolve();
      let outputOpen = true;
      request.signal.addEventListener("abort", abortUpstream, { once: true });
      if (request.signal.aborted) upstreamController.abort();

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
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };

      send({
        type: "meta",
        conversationId: stableConversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        title,
      });

      void (async () => {
        if (!deepSeekKey) {
          await supabase
            .from("messages")
            .update({ status: "error", duration_ms: Date.now() - startedAt })
            .eq("id", assistantMessage.id);
          send({ type: "error", message: "DeepSeek is not configured." });
          close();
          return;
        }

        try {
          const result = await runDeepSeekAgent({
            apiKey: deepSeekKey,
            preset,
            messages: buildProviderMessages(
              [...(history ?? []), { role: "user", content: message }],
              systemPrompt,
            ),
            braveKeys,
            tavilyKeys,
            signal: upstreamController.signal,
            onReasoning(delta) {
              reasoning += delta;
              send({ type: "reasoning_delta", delta });
            },
            onContent(delta) {
              content += delta;
              send({ type: "content_delta", delta });
            },
            onActivity(activity) {
              activities = upsertToolActivity(activities, activity);
              send({ type: "tool_activity", activity });
              if (activity.status === "running") return;
              const snapshot = activities;
              activityWrites = activityWrites.then(async () => {
                await supabase
                  .from("messages")
                  .update({ tool_activity: snapshot })
                  .eq("id", assistantMessage.id)
                  .eq("status", "streaming");
              });
            },
          });
          content = result.content;
          reasoning = result.reasoning;
          await activityWrites;

          const durationMs = Date.now() - startedAt;
          await supabase
            .from("messages")
            .update({
              content,
              reasoning_content: reasoning,
              tool_activity: activities,
              status: "completed",
              duration_ms: durationMs,
            })
            .eq("id", assistantMessage.id)
            .eq("status", "streaming");
          if (!titleFinalizedAt) {
            const finalizedTitle = await finalizeConversationTitle({
              supabase,
              conversationId: stableConversationId,
              messages: [
                ...(history ?? []),
                { role: "user", content: message },
                { role: "assistant", content },
              ],
              apiKey: deepSeekKey,
            });
            if (finalizedTitle) {
              title = finalizedTitle;
              send({
                type: "title",
                conversationId: stableConversationId,
                title: finalizedTitle,
              });
            }
          }
          send({ type: "done", durationMs, status: "completed" });
        } catch (caught) {
          const durationMs = Date.now() - startedAt;
          const stopped = upstreamController.signal.aborted || request.signal.aborted;
          await activityWrites;
          await supabase
            .from("messages")
            .update({
              content,
              reasoning_content: reasoning,
              tool_activity: activities,
              status: stopped ? "stopped" : "error",
              duration_ms: durationMs,
            })
            .eq("id", assistantMessage.id)
            .eq("status", "streaming");

          if (stopped) {
            send({ type: "done", durationMs, status: "stopped" });
          } else {
            send({
              type: "error",
              message: caught instanceof Error ? caught.message : "DeepSeek could not complete the response.",
            });
          }
        } finally {
          request.signal.removeEventListener("abort", abortUpstream);
          close();
        }
      })();
    },
    cancel() {
      upstreamController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
