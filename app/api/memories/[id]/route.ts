import { NextResponse } from "next/server";
import { editMemory, parseMemoryType, parseOptionalScore } from "@/lib/memory/store";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const [{ data: memory }, { data: sources }] = await Promise.all([
    auth.supabase.from("user_memories").select("*").eq("id", id).maybeSingle(),
    auth.supabase.from("memory_sources").select("id,conversation_id,message_id,source_kind,created_at")
      .eq("memory_id", id).order("created_at", { ascending: true }),
  ]);
  if (!memory) return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  return NextResponse.json({ memory, sources: sources ?? [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  try {
    if (typeof body.pinned === "boolean" && body.content === undefined) {
      const now = new Date().toISOString();
      const { data, error } = await auth.supabase.from("user_memories")
        .update(body.pinned
          ? { pinned: true, confidence: 1, origin: "manual", confirmed_at: now, updated_at: now }
          : { pinned: false, updated_at: now })
        .eq("id", id).select().maybeSingle();
      if (error || !data) throw new Error("Memory not found.");
      await auth.supabase.from("memory_events").insert({
        user_id: auth.user.id, memory_id: id, action: body.pinned ? "pinned" : "unpinned",
        actor: "user", metadata: {},
      });
      return NextResponse.json({ memory: data });
    }
    if (typeof body.content !== "string") throw new TypeError("Memory content is required.");
    const memory = await editMemory({
      supabase: auth.supabase,
      userId: auth.user.id,
      memoryId: id,
      content: body.content,
      memoryType: parseMemoryType(body.memoryType),
      salience: parseOptionalScore(body.salience, 0.7),
      validUntil: typeof body.validUntil === "string" ? body.validUntil : null,
    });
    return NextResponse.json({ memory });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Invalid memory." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await auth.supabase.from("user_memories").update({
    canonical_content: null,
    state: "deleted",
    pinned: false,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).neq("state", "deleted").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to forget memory." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
