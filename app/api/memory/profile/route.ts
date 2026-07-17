import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function POST(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { action?: unknown; profileId?: unknown };
  try { body = await request.json() as { action?: unknown; profileId?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (body.action !== "refresh" && body.action !== "rollback") {
    return NextResponse.json({ error: "Invalid profile action." }, { status: 400 });
  }
  if (body.action === "rollback" && typeof body.profileId !== "string") {
    return NextResponse.json({ error: "A profile snapshot is required." }, { status: 400 });
  }
  if (typeof body.profileId === "string") {
    const { data } = await auth.supabase.from("memory_profiles").select("id")
      .eq("id", body.profileId).eq("user_id", auth.user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  const { data, error } = await auth.supabase.from("memory_commands").insert({
    user_id: auth.user.id,
    command: body.action === "refresh" ? "refresh_profile" : "rollback_profile",
    payload: typeof body.profileId === "string" ? { profile_id: body.profileId } : {},
  }).select("id,status").single();
  if (error || !data) return NextResponse.json({ error: "Unable to queue profile action." }, { status: 500 });
  return NextResponse.json({ command: data }, { status: 202 });
}

