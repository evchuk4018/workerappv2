import { NextResponse, type NextRequest } from "next/server";
import { CHAT_FILES_BUCKET } from "@/lib/chat-files";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const { data: file } = await auth.supabase.from("chat_files")
    .select("object_path,original_name").eq("id", id).maybeSingle();
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await auth.supabase.storage.from(CHAT_FILES_BUCKET)
    .createSignedUrl(file.object_path, 60, download ? { download: file.original_name } : undefined);
  if (error || !data) return NextResponse.json({ error: "Unable to open file." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
