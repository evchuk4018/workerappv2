import { NextResponse, type NextRequest } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";

const SELECT_FIELDS = "id,title,memory_mode,created_at,updated_at";

export async function GET(request: NextRequest) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("query")?.trim();
  if (!query) {
    const { data, error } = await auth.supabase
      .from("conversations")
      .select(SELECT_FIELDS)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: "Unable to load chats." }, { status: 500 });
    return NextResponse.json({ conversations: data });
  }

  const pattern = `%${query.replace(/[%,_]/g, " ")}%`;
  const [{ data: titleMatches }, { data: messageMatches }] = await Promise.all([
    auth.supabase.from("conversations").select(SELECT_FIELDS).ilike("title", pattern).limit(50),
    auth.supabase.from("messages").select("conversation_id").ilike("content", pattern).limit(100),
  ]);

  const ids = new Set((titleMatches ?? []).map((item) => item.id));
  for (const item of messageMatches ?? []) ids.add(item.conversation_id);

  let conversations = titleMatches ?? [];
  const missingIds = [...ids].filter((id) => !conversations.some((item) => item.id === id));
  if (missingIds.length) {
    const { data } = await auth.supabase
      .from("conversations")
      .select(SELECT_FIELDS)
      .in("id", missingIds);
    conversations = [...conversations, ...(data ?? [])];
  }

  conversations.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return NextResponse.json({ conversations });
}
