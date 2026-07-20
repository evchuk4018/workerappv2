import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { attachmentManifest, objectPath, validateInputFiles } from "@/lib/chat-files";
import type { AgentExecutionState } from "@/lib/deepseek/agent";
import { boundConversationMessages } from "@/lib/memory/budget";
import { memoryContextInstruction, retrieveMemoryContext } from "@/lib/memory/retrieval";
import type { MemoryMode } from "@/lib/memory/types";
import { isModelPreset } from "@/lib/models";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { buildProviderMessages } from "@/lib/system-prompt";
import { titleFromMessage } from "@/lib/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StartBody {
  conversationId?: unknown;
  message?: unknown;
  preset?: unknown;
  memoryMode?: unknown;
  attachments?: unknown;
}

function json(value: unknown) {
  return value as Json;
}

export async function POST(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: StartBody;
  try { body = (await request.json()) as StartBody; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationIdValue = typeof body.conversationId === "string" ? body.conversationId : null;
  const requestedMode: MemoryMode = body.memoryMode === "off" ? "off" : "normal";
  let attachments;
  try { attachments = validateInputFiles(body.attachments ?? []); }
  catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Invalid attachments." }, { status: 400 });
  }
  if (!message || message.length > 100_000 || !isModelPreset(body.preset)) {
    return NextResponse.json({ error: "A valid message and model preset are required." }, { status: 400 });
  }

  const supabase = auth.supabase;
  let conversationId = conversationIdValue;
  let title = titleFromMessage(message);
  let systemPrompt = "";
  let memoryMode = requestedMode;

  if (conversationId) {
    const { data: existing } = await supabase.from("conversations")
      .select("id,title,system_prompt,memory_mode").eq("id", conversationId).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    title = existing.title;
    systemPrompt = existing.system_prompt;
    memoryMode = existing.memory_mode;
  } else {
    const { data: settings, error: settingsError } = await supabase.from("user_settings")
      .select("system_prompt").eq("user_id", auth.user.id).maybeSingle();
    if (settingsError) return NextResponse.json({ error: "Unable to load settings." }, { status: 500 });
    systemPrompt = settings?.system_prompt ?? "";
    const { data: created, error } = await supabase.from("conversations")
      .insert({ user_id: auth.user.id, title, system_prompt: systemPrompt, memory_mode: memoryMode })
      .select("id,title,memory_mode").single();
    if (error || !created) return NextResponse.json({ error: "Unable to create the chat." }, { status: 500 });
    conversationId = created.id;
    title = created.title;
    memoryMode = created.memory_mode;
  }

  const { data: history, error: historyError } = await supabase.from("messages")
    .select("role,content").eq("conversation_id", conversationId)
    .in("status", ["completed", "stopped"]).order("created_at", { ascending: true });
  if (historyError) return NextResponse.json({ error: "Unable to load chat history." }, { status: 500 });

  const { data: userMessage, error: userError } = await supabase.from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: message, status: "completed" })
    .select("id").single();
  if (userError || !userMessage) return NextResponse.json({ error: "Unable to save the message." }, { status: 500 });

  const { data: assistantMessage, error: assistantError } = await supabase.from("messages").insert({
    conversation_id: conversationId, role: "assistant", content: "", reasoning_content: "",
    reasoning_blocks: [], tool_activity: [], model_preset: body.preset, status: "streaming",
  }).select("id").single();
  if (assistantError || !assistantMessage) {
    return NextResponse.json({ error: "Unable to prepare the response." }, { status: 500 });
  }

  const runId = crypto.randomUUID();
  const fileRows = attachments.map((file) => {
    const id = crypto.randomUUID();
    return {
      id, user_id: auth.user.id, conversation_id: conversationId, message_id: userMessage.id,
      agent_run_id: runId, kind: "input" as const, bucket_id: "chat-files" as const,
      object_path: objectPath(auth.user.id, conversationId!, id, file.name),
      original_name: file.name, mime_type: file.mimeType, size_bytes: file.sizeBytes,
    };
  });
  const titleMessages = [...(history ?? []), { role: "user" as const, content: message }];
  const memory = await retrieveMemoryContext({
    supabase, userId: auth.user.id, conversationId, memoryMode, query: message,
  });
  // Keep room for the system prompt and tool-result turns stored by the resumable runner.
  const boundedHistory = boundConversationMessages(titleMessages).slice(-60);
  if (fileRows.length) {
    const last = boundedHistory.at(-1);
    if (last?.role === "user") {
      last.content = `${last.content}\n\n${attachmentManifest(fileRows)}`;
    }
  }
  const providerMessages = buildProviderMessages(boundedHistory, systemPrompt, {
    stableProfile: memory.stableProfile,
    dynamicContext: memoryContextInstruction(memory),
  });
  const state: AgentExecutionState = {
    messages: providerMessages,
    content: "", reasoning: "", toolRounds: 0, pythonExecutions: 0,
  };

  const { error: runError } = await supabase.from("agent_runs").insert({
    id: runId, user_id: auth.user.id, conversation_id: conversationId,
    user_message_id: userMessage.id, assistant_message_id: assistantMessage.id,
    status: fileRows.length ? "uploading" : "ready", provider_state: json(state),
  });
  if (runError) {
    await supabase.from("messages").update({ status: "error" }).eq("id", assistantMessage.id);
    return NextResponse.json({ error: "Unable to prepare Python-capable generation." }, { status: 500 });
  }
  if (fileRows.length) {
    const { error: filesError } = await supabase.from("chat_files").insert(fileRows);
    if (filesError) {
      await Promise.all([
        supabase.from("agent_runs").update({
          status: "error", provider_state: {}, error: "Unable to register attachments.",
          completed_at: new Date().toISOString(),
        }).eq("id", runId),
        supabase.from("messages").update({ status: "error" }).eq("id", assistantMessage.id),
      ]);
      return NextResponse.json({ error: "Unable to register attachments." }, { status: 500 });
    }
  }

  return NextResponse.json({
    runId, conversationId, userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id, title, memoryMode,
    uploads: fileRows.map((file) => ({
      fileId: file.id, objectPath: file.object_path, name: file.original_name,
      mimeType: file.mime_type, sizeBytes: file.size_bytes,
    })),
  }, { status: 201 });
}
