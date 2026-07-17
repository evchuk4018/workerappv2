import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function POST(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { scope?: unknown };
  try { body = await request.json() as { scope?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (body.scope !== "inferred" && body.scope !== "all") {
    return NextResponse.json({ error: "Invalid clear scope." }, { status: 400 });
  }
  let query = auth.supabase.from("user_memories").update({
    canonical_content: null,
    state: "deleted",
    pinned: false,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", auth.user.id).neq("state", "deleted");
  if (body.scope === "inferred") query = query.eq("origin", "inferred");
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Unable to clear memories." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
