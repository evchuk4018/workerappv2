import { NextResponse } from "next/server";
import { objectPath, validateOutputFiles } from "@/lib/chat-files";
import { getAllowedUser } from "@/lib/supabase/auth-user";

interface ArtifactBody { files?: unknown; callToken?: unknown }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: ArtifactBody;
  try { body = (await request.json()) as ArtifactBody; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  let files;
  try { files = validateOutputFiles(body.files ?? []); }
  catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Invalid artifacts." }, { status: 400 });
  }
  const { id } = await context.params;
  const { data: run } = await auth.supabase.from("agent_runs")
    .select("id,conversation_id,assistant_message_id,status,pending_call_token")
    .eq("id", id).maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "awaiting_python") {
    return NextResponse.json({ error: "This run is not waiting for Python artifacts." }, { status: 409 });
  }
  if (typeof body.callToken !== "string" || body.callToken !== run.pending_call_token) {
    return NextResponse.json({ error: "Artifact upload token is stale." }, { status: 409 });
  }
  const callToken = body.callToken;
  const rows = files.map((file, callIndex) => {
    const fileId = crypto.randomUUID();
    return {
      id: fileId, user_id: auth.user.id, conversation_id: run.conversation_id,
      message_id: run.assistant_message_id, agent_run_id: run.id, kind: "artifact" as const,
      call_token: callToken, call_index: callIndex,
      bucket_id: "chat-files" as const, object_path: objectPath(
        auth.user.id, run.conversation_id, fileId, file.name,
      ),
      original_name: file.name, mime_type: file.mimeType, size_bytes: file.sizeBytes,
    };
  });
  if (rows.length) {
    const { error } = await auth.supabase.from("chat_files").insert(rows);
    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ error: status === 409
        ? "Another client already registered files for this Python call."
        : "Unable to register generated files." }, { status });
    }
  }
  return NextResponse.json({
    uploads: rows.map((file) => ({
      fileId: file.id, objectPath: file.object_path, name: file.original_name,
      mimeType: file.mime_type, sizeBytes: file.size_bytes,
    })),
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let body: ArtifactBody;
  try { body = (await request.json()) as ArtifactBody; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const { data: run } = await auth.supabase.from("agent_runs")
    .select("status,pending_call_token").eq("id", id).maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "awaiting_python" || typeof body.callToken !== "string"
    || body.callToken !== run.pending_call_token) {
    return NextResponse.json({ error: "Artifact cleanup token is stale." }, { status: 409 });
  }
  const { data: files, error: readError } = await auth.supabase.from("chat_files")
    .select("id,object_path").eq("agent_run_id", id).eq("kind", "artifact")
    .eq("call_token", body.callToken);
  if (readError) return NextResponse.json({ error: "Unable to inspect generated files." }, { status: 500 });
  const paths = (files ?? []).map((file) => file.object_path);
  if (paths.length) await auth.supabase.storage.from("chat-files").remove(paths);
  const { error } = await auth.supabase.from("chat_files").delete()
    .eq("agent_run_id", id).eq("kind", "artifact").eq("call_token", body.callToken);
  if (error) return NextResponse.json({ error: "Unable to clean generated files." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
