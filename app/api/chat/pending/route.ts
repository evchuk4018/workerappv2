import { NextResponse, type NextRequest } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function GET(request: NextRequest) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const assistantMessageId = request.nextUrl.searchParams.get("assistantMessageId");
  if (!conversationId) return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  let query = auth.supabase.from("agent_runs")
    .select("id,status,assistant_message_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(1);
  if (assistantMessageId) query = query.eq("assistant_message_id", assistantMessageId);
  const { data: run } = await query.maybeSingle();
  return NextResponse.json({ run: run ?? null });
}
