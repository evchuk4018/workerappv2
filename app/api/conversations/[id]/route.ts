import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { normalizeReasoningBlocks } from "@/lib/reasoning-block";
import { normalizeToolActivities } from "@/lib/tool-activity";
import { attachFilesToMessages } from "@/lib/message-files";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const [{ data: conversation }, { data: messages, error }, { data: files }] = await Promise.all([
    auth.supabase
      .from("conversations")
      .select("id,title,memory_mode,created_at,updated_at")
      .eq("id", id)
      .maybeSingle(),
    auth.supabase
      .from("messages")
      .select("id,conversation_id,role,content,reasoning_content,reasoning_blocks,tool_activity,model_preset,status,duration_ms,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    auth.supabase.from("chat_files")
      .select("id,message_id,kind,original_name,mime_type,size_bytes,created_at")
      .eq("conversation_id", id),
  ]);

  if (!conversation) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  if (error) return NextResponse.json({ error: "Unable to load messages." }, { status: 500 });
  return NextResponse.json({
    conversation,
    messages: attachFilesToMessages(messages?.map((item) => ({
      ...item,
      reasoning_blocks: normalizeReasoningBlocks(item.reasoning_blocks),
      tool_activity: normalizeToolActivities(item.tool_activity),
    })) ?? [], files ?? []),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { memoryMode?: unknown };
  try { body = (await request.json()) as { memoryMode?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (body.memoryMode !== "normal" && body.memoryMode !== "off") {
    return NextResponse.json({ error: "Invalid memory mode." }, { status: 400 });
  }
  const { id } = await context.params;
  const { data, error } = await auth.supabase.from("conversations")
    .update({ memory_mode: body.memoryMode, updated_at: new Date().toISOString() })
    .eq("id", id).select("id,memory_mode").maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to update memory mode." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  return NextResponse.json({ memoryMode: data.memory_mode });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const { data: conversation } = await auth.supabase.from("conversations")
    .select("id").eq("id", id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  const { data: files, error: filesError } = await auth.supabase.from("chat_files")
    .select("object_path").eq("conversation_id", id);
  if (filesError) return NextResponse.json({ error: "Unable to inspect chat files." }, { status: 500 });
  if (files?.length) {
    const { error } = await auth.supabase.storage.from("chat-files")
      .remove(files.map((file) => file.object_path));
    if (error) return NextResponse.json({ error: "Unable to remove stored chat files." }, { status: 500 });
  }
  const { error } = await auth.supabase.from("conversations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Unable to delete chat." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
