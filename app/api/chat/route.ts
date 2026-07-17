import { createChatStream } from "./chat-stream";
import { boundConversationMessages } from "@/lib/memory/budget";
import { memoryContextInstruction, retrieveMemoryContext } from "@/lib/memory/retrieval";
import type { MemoryMode } from "@/lib/memory/types";
import { isModelPreset } from "@/lib/models";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { buildProviderMessages } from "@/lib/system-prompt";
import { titleFromMessage } from "@/lib/title";
import { parseApiKeys } from "@/lib/web/key-failover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  conversationId?: string | null;
  message?: string;
  preset?: unknown;
  memoryMode?: unknown;
}

export async function POST(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: ChatRequestBody;
  try { body = (await request.json()) as ChatRequestBody; }
  catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const message = body.message?.trim();
  const requestedMode: MemoryMode = body.memoryMode === "off" ? "off" : "normal";
  if (!message || message.length > 100_000 || !isModelPreset(body.preset)) {
    return Response.json({ error: "A valid message and model preset are required." }, { status: 400 });
  }

  const supabase = auth.supabase;
  let conversationId = body.conversationId ?? null;
  let title = titleFromMessage(message);
  let titleFinalizedAt: string | null = null;
  let systemPrompt = "";
  let memoryMode: MemoryMode = requestedMode;

  if (conversationId) {
    const { data: existing } = await supabase.from("conversations")
      .select("id,title,title_finalized_at,system_prompt,memory_mode")
      .eq("id", conversationId).maybeSingle();
    if (!existing) return Response.json({ error: "Chat not found." }, { status: 404 });
    title = existing.title;
    titleFinalizedAt = existing.title_finalized_at;
    systemPrompt = existing.system_prompt;
    memoryMode = existing.memory_mode;
  } else {
    const { data: settings, error: settingsError } = await supabase.from("user_settings")
      .select("system_prompt").eq("user_id", auth.user.id).maybeSingle();
    if (settingsError) return Response.json({ error: "Unable to load settings." }, { status: 500 });
    systemPrompt = settings?.system_prompt ?? "";
    const { data: created, error } = await supabase.from("conversations")
      .insert({ user_id: auth.user.id, title, system_prompt: systemPrompt, memory_mode: memoryMode })
      .select("id,title,title_finalized_at,memory_mode").single();
    if (error || !created) return Response.json({ error: "Unable to create the chat." }, { status: 500 });
    conversationId = created.id;
    title = created.title;
    titleFinalizedAt = created.title_finalized_at;
    memoryMode = created.memory_mode;
  }

  const { data: history, error: historyError } = await supabase.from("messages")
    .select("role,content").eq("conversation_id", conversationId)
    .in("status", ["completed", "stopped"]).order("created_at", { ascending: true });
  if (historyError) return Response.json({ error: "Unable to load chat history." }, { status: 500 });

  const { data: userMessage, error: userError } = await supabase.from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: message, status: "completed" })
    .select("id").single();
  if (userError || !userMessage) return Response.json({ error: "Unable to save the message." }, { status: 500 });

  const { data: assistantMessage, error: assistantError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: "",
    reasoning_content: "",
    reasoning_blocks: [],
    model_preset: body.preset,
    status: "streaming",
  }).select("id").single();
  if (assistantError || !assistantMessage) {
    return Response.json({ error: "Unable to prepare the response." }, { status: 500 });
  }

  const titleMessages = [...(history ?? []), { role: "user" as const, content: message }];
  const memory = await retrieveMemoryContext({
    supabase,
    userId: auth.user.id,
    conversationId,
    memoryMode,
    query: message,
  });
  const boundedHistory = boundConversationMessages(titleMessages);
  const providerMessages = buildProviderMessages(boundedHistory, systemPrompt, {
    stableProfile: memory.stableProfile,
    dynamicContext: memoryContextInstruction(memory),
  });

  return createChatStream({
    request,
    supabase,
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    title,
    titleFinalizedAt,
    titleMessages,
    providerMessages,
    preset: body.preset,
    deepSeekKey: process.env.DEEPSEEK_API_KEY,
    braveKeys: parseApiKeys(process.env.BRAVE_SEARCH_API_KEYS),
    tavilyKeys: parseApiKeys(process.env.TAVILY_API_KEYS),
  });
}
