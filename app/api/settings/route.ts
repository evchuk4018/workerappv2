import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { normalizeSystemPrompt } from "@/lib/system-prompt";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("user_settings")
    .select("system_prompt")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load settings." }, { status: 500 });
  }
  return NextResponse.json({ systemPrompt: data?.system_prompt ?? "" });
}

export async function PUT(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { systemPrompt?: unknown };
  try {
    body = (await request.json()) as { systemPrompt?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.systemPrompt !== "string") {
    return NextResponse.json({ error: "A system prompt is required." }, { status: 400 });
  }

  let systemPrompt: string;
  try {
    systemPrompt = normalizeSystemPrompt(body.systemPrompt);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Invalid system prompt." },
      { status: 400 },
    );
  }

  const { error } = await auth.supabase.from("user_settings").upsert(
    {
      user_id: auth.user.id,
      system_prompt: systemPrompt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: "Unable to save settings." }, { status: 500 });
  }
  return NextResponse.json({ systemPrompt });
}
