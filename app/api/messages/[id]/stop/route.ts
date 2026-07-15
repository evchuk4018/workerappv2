import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";

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

  const { error } = await auth.supabase
    .from("messages")
    .update({ content, reasoning_content: reasoning, duration_ms: durationMs, status: "stopped" })
    .eq("id", id)
    .eq("role", "assistant")
    .eq("status", "streaming");

  if (error) return NextResponse.json({ error: "Unable to stop the response." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
