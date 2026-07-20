import { NextResponse } from "next/server";
import { CHAT_FILES_BUCKET } from "@/lib/chat-files";
import { getAllowedUser } from "@/lib/supabase/auth-user";

interface UploadBody { action?: unknown }

function splitPath(path: string) {
  const index = path.lastIndexOf("/");
  return { folder: path.slice(0, index), name: path.slice(index + 1) };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let body: UploadBody;
  try { body = (await request.json()) as UploadBody; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (body.action !== "finalize" && body.action !== "abort") {
    return NextResponse.json({ error: "Upload action must be finalize or abort." }, { status: 400 });
  }

  const { data: run } = await auth.supabase.from("agent_runs")
    .select("id,status,version,assistant_message_id").eq("id", id).maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "uploading") {
    return NextResponse.json({ error: "This run is not accepting input uploads." }, { status: 409 });
  }
  const { data: files, error: filesError } = await auth.supabase.from("chat_files")
    .select("id,object_path,size_bytes,mime_type").eq("agent_run_id", id).eq("kind", "input");
  if (filesError) return NextResponse.json({ error: "Unable to inspect input files." }, { status: 500 });

  if (body.action === "abort") {
    const paths = (files ?? []).map((file) => file.object_path);
    if (paths.length) await auth.supabase.storage.from(CHAT_FILES_BUCKET).remove(paths);
    const { error: runError } = await auth.supabase.from("agent_runs").update({
      status: "error", provider_state: {}, error: "Input upload was interrupted.",
      completed_at: new Date().toISOString(), version: run.version + 1,
    }).eq("id", id).eq("status", "uploading").eq("version", run.version);
    const { error: messageError } = run.assistant_message_id
      ? await auth.supabase.from("messages").update({ status: "error" }).eq("id", run.assistant_message_id)
      : { error: null };
    if (runError || messageError) {
      return NextResponse.json({ error: "Unable to cancel the interrupted upload." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  for (const file of files ?? []) {
    const { folder, name } = splitPath(file.object_path);
    const { data, error } = await auth.supabase.storage.from(CHAT_FILES_BUCKET)
      .list(folder, { search: name, limit: 10 });
    const stored = data?.find((item) => item.name === name);
    const storedSize = Number(stored?.metadata?.size);
    const storedType = String(stored?.metadata?.mimetype ?? "").toLowerCase();
    if (error || !stored || storedSize !== file.size_bytes
      || (storedType && storedType !== file.mime_type.toLowerCase())) {
      return NextResponse.json({ error: `Upload verification failed for ${name}.` }, { status: 409 });
    }
  }
  const { data: ready, error } = await auth.supabase.from("agent_runs").update({
    status: "ready", version: run.version + 1,
  }).eq("id", id).eq("status", "uploading").eq("version", run.version).select("id").maybeSingle();
  if (error || !ready) {
    return NextResponse.json({ error: "Another client finalized this upload first." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
