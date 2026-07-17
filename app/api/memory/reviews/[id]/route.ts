import { NextResponse } from "next/server";
import { createManualMemory, parseMemoryType } from "@/lib/memory/store";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { decision?: unknown };
  try { body = await request.json() as { decision?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (body.decision !== "accept" && body.decision !== "reject") {
    return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  }
  const { id } = await context.params;
  const { data: review } = await auth.supabase.from("memory_reviews").select("*")
    .eq("id", id).eq("state", "pending").maybeSingle();
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });

  try {
    let memoryId: string | null = null;
    if (body.decision === "accept" && review.proposed_content && review.memory_type) {
      const memory = await createManualMemory({
        supabase: auth.supabase,
        userId: auth.user.id,
        content: review.proposed_content,
        memoryType: parseMemoryType(review.memory_type),
      });
      memoryId = memory.id;
    }
    const { error } = await auth.supabase.from("memory_reviews").update({
      state: body.decision === "accept" ? "accepted" : "rejected",
      related_memory_id: memoryId ?? review.related_memory_id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, memoryId });
  } catch {
    return NextResponse.json({ error: "Unable to review memory." }, { status: 500 });
  }
}
