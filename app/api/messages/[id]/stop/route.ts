import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { finalizeConversationTitle } from "@/lib/title-finalization";

interface StopBody {
  content?: unknown;
  reasoning?: unknown;
  durationMs?: unknown;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  let body: StopBody = {};
  try {
    body = (await request.json()) as StopBody;
  } catch {
    // Empty partial output is valid.
  }

  const content = typeof body.content === "string" ? body.content : "";
  const reasoning = typeof body.reasoning === "string" ? body.reasoning : "";
  const durationMs = typeof body.durationMs === "number" && body.durationMs >= 0
    ? Math.round(body.durationMs)
    : null;

  const { data: assistant } = await auth.supabase
    .from("messages")
    .select("id,conversation_id")
    .eq("id", id)
    .eq("role", "assistant")
    .maybeSingle();
  if (!assistant) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const { error } = await auth.supabase
    .from("messages")
    .update({ content, reasoning_content: reasoning, duration_ms: durationMs, status: "stopped" })
    .eq("id", id)
    .eq("role", "assistant")
    .eq("status", "streaming");

  if (error) return NextResponse.json({ error: "Unable to stop the response." }, { status: 500 });

  const { data: conversation } = await auth.supabase
    .from("conversations")
    .select("title_finalized_at")
    .eq("id", assistant.conversation_id)
    .maybeSingle();
  let title: string | null = null;
  if (conversation && !conversation.title_finalized_at) {
    const { data: messages } = await auth.supabase
      .from("messages")
      .select("role,content")
      .eq("conversation_id", assistant.conversation_id)
      .in("status", ["completed", "stopped"])
      .order("created_at", { ascending: true });
    if (messages) {
      title = await finalizeConversationTitle({
        supabase: auth.supabase,
        conversationId: assistant.conversation_id,
        messages,
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
    }
  }

  return NextResponse.json({ ok: true, ...(title ? { title } : {}) });
}
