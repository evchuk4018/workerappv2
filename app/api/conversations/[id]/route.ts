import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { normalizeReasoningBlocks } from "@/lib/reasoning-block";
import { normalizeToolActivities } from "@/lib/tool-activity";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const [{ data: conversation }, { data: messages, error }] = await Promise.all([
    auth.supabase
      .from("conversations")
      .select("id,title,created_at,updated_at")
      .eq("id", id)
      .maybeSingle(),
    auth.supabase
      .from("messages")
      .select("id,conversation_id,role,content,reasoning_content,reasoning_blocks,tool_activity,model_preset,status,duration_ms,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!conversation) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  if (error) return NextResponse.json({ error: "Unable to load messages." }, { status: 500 });
  return NextResponse.json({
    conversation,
    messages: messages?.map((item) => ({
      ...item,
      reasoning_blocks: normalizeReasoningBlocks(item.reasoning_blocks),
      tool_activity: normalizeToolActivities(item.tool_activity),
    })) ?? [],
  });
}
