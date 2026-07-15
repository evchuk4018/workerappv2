import { buildDeepSeekModelOptions, isModelPreset } from "@/lib/models";
import { encodeStreamEvent, parseDeepSeekSseBlock } from "@/lib/streaming";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { titleFromMessage } from "@/lib/title";

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

  if (conversationId) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id,title")
      .eq("id", conversationId)
      .maybeSingle();
    if (!existing) return Response.json({ error: "Chat not found." }, { status: 404 });
    title = existing.title;
  } else {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ user_id: auth.user.id, title })
      .select("id,title")
      .single();
    if (error || !created) {
      return Response.json({ error: "Unable to create the chat." }, { status: 500 });
    }
    conversationId = created.id;
    title = created.title;
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
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stableConversationId = conversationId;
  const preset = body.preset;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let content = "";
      let reasoning = "";
      let outputOpen = true;
      const upstreamController = new AbortController();
      const abortUpstream = () => upstreamController.abort();
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
          const modelOptions = buildDeepSeekModelOptions(preset);
          const upstream = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${deepSeekKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...modelOptions,
              messages: [...(history ?? []), { role: "user", content: message }],
              stream: true,
              max_tokens: 8192,
            }),
            signal: upstreamController.signal,
          });

          if (!upstream.ok || !upstream.body) {
            throw new Error(`DeepSeek returned ${upstream.status}.`);
          }

          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let finished = false;

          while (!finished) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? "";

            for (const block of blocks) {
              const delta = parseDeepSeekSseBlock(block);
              if (!delta) continue;
              if (delta.reasoning) {
                reasoning += delta.reasoning;
                send({ type: "reasoning_delta", delta: delta.reasoning });
              }
              if (delta.content) {
                content += delta.content;
                send({ type: "content_delta", delta: delta.content });
              }
              if (delta.done) {
                finished = true;
                break;
              }
            }
          }

          if (!finished && buffer.trim()) {
            const delta = parseDeepSeekSseBlock(buffer);
            if (delta?.reasoning) {
              reasoning += delta.reasoning;
              send({ type: "reasoning_delta", delta: delta.reasoning });
            }
            if (delta?.content) {
              content += delta.content;
              send({ type: "content_delta", delta: delta.content });
            }
          }

          const durationMs = Date.now() - startedAt;
          await supabase
            .from("messages")
            .update({ content, reasoning_content: reasoning, status: "completed", duration_ms: durationMs })
            .eq("id", assistantMessage.id)
            .eq("status", "streaming");
          send({ type: "done", durationMs, status: "completed" });
        } catch (caught) {
          const durationMs = Date.now() - startedAt;
          const stopped = upstreamController.signal.aborted || request.signal.aborted;
          await supabase
            .from("messages")
            .update({
              content,
              reasoning_content: reasoning,
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
      // Client cancellation propagates through request.signal in supported runtimes.
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
