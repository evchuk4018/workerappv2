import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { finalizeConversationTitle } from "@/lib/title-finalization";
import { normalizeReasoningBlocks } from "@/lib/reasoning-block";
import { normalizeToolActivities } from "@/lib/tool-activity";

interface StopBody {
  content?: unknown;
  reasoning?: unknown;
  reasoningBlocks?: unknown;
  durationMs?: unknown;
  toolActivity?: unknown;
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
  const reasoningBlocks = normalizeReasoningBlocks(body.reasoningBlocks);
  const durationMs = typeof body.durationMs === "number" && body.durationMs >= 0
    ? Math.round(body.durationMs)
    : null;
  const toolActivity = normalizeToolActivities(body.toolActivity).map((activity) => activity.status === "running"
    ? {
        ...activity,
        status: "error" as const,
        error: "Stopped before this tool completed.",
        completed_at: new Date().toISOString(),
      }
    : activity);

  const { data: assistant } = await auth.supabase
    .from("messages")
    .select("id,conversation_id")
    .eq("id", id)
    .eq("role", "assistant")
    .maybeSingle();
  if (!assistant) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const { data: stopResult, error: stopError } = await auth.supabase.rpc("stop_agent_run", {
    p_assistant_message_id: id,
    p_content: content,
    p_reasoning: reasoning,
    p_reasoning_blocks: reasoningBlocks as unknown as Json,
    p_tool_activity: toolActivity as unknown as Json,
    p_duration_ms: durationMs,
  });
  if (stopError) return NextResponse.json({ error: "Unable to stop the saved run." }, { status: 500 });
  if (stopResult === "terminal") {
    return NextResponse.json({ error: "This response already finished." }, { status: 409 });
  }
  if (stopResult === "no_run") {
    const { data: stopped, error } = await auth.supabase.from("messages").update({
      content, reasoning_content: reasoning, reasoning_blocks: reasoningBlocks,
      tool_activity: toolActivity, duration_ms: durationMs, status: "stopped",
    }).eq("id", id).eq("role", "assistant").in("status", ["streaming", "awaiting_tool"])
      .select("id").maybeSingle();
    if (error || !stopped) {
      return NextResponse.json({ error: "Unable to stop the response." }, { status: 409 });
    }
  }

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
