import { NextResponse } from "next/server";
import { parsePendingPythonRequest } from "@/lib/deepseek/python-result";
import { safeFileName } from "@/lib/chat-files";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let { data: run } = await auth.supabase.from("agent_runs")
    .select("id,status,assistant_message_id,pending_tool_call,pending_call_token,lease_token,lease_expires_at,version")
    .eq("id", id).maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  if (run.status === "streaming" && run.lease_expires_at
    && new Date(run.lease_expires_at).getTime() <= Date.now()) {
    const { data: recovered } = await auth.supabase.from("agent_runs").update({
      status: "ready", lease_token: null, lease_expires_at: null, version: run.version + 1,
    }).eq("id", id).eq("status", "streaming").eq("version", run.version)
      .eq("lease_token", run.lease_token!)
      .select("id,status,assistant_message_id,pending_tool_call,pending_call_token,lease_token,lease_expires_at,version").maybeSingle();
    if (recovered) run = recovered;
  }
  if (run.status === "ready") return NextResponse.json({ status: "ready", runId: run.id });
  if (run.status === "streaming") {
    const expiresAt = run.lease_expires_at ? new Date(run.lease_expires_at).getTime() : Date.now() + 2_000;
    return NextResponse.json({
      status: "streaming", runId: run.id,
      retryAfterMs: Math.max(500, Math.min(5_000, expiresAt - Date.now() + 100)),
    });
  }
  if (run.status === "uploading") {
    return NextResponse.json({ status: "uploading", runId: run.id });
  }
  if (run.status !== "awaiting_python" || !run.pending_call_token) {
    const { data: message } = run.assistant_message_id
      ? await auth.supabase.from("messages").select("*").eq("id", run.assistant_message_id).maybeSingle()
      : { data: null };
    return NextResponse.json({ status: run.status, runId: run.id, message });
  }

  let request;
  try { request = parsePendingPythonRequest(run.pending_tool_call); }
  catch { return NextResponse.json({ error: "Pending Python request is invalid." }, { status: 500 }); }
  const { data: inputs } = request.inputFileIds.length
    ? await auth.supabase.from("chat_files")
      .select("id,object_path,original_name,mime_type,size_bytes")
      .eq("agent_run_id", run.id).eq("kind", "input").in("id", request.inputFileIds)
    : { data: [] };
  if ((inputs ?? []).length !== request.inputFileIds.length) {
    return NextResponse.json({ error: "Pending Python inputs are unavailable." }, { status: 409 });
  }
  return NextResponse.json({
    status: "awaiting_python", runId: run.id, callToken: run.pending_call_token, request,
    inputs: (inputs ?? []).map((file) => ({
      fileId: file.id, objectPath: file.object_path,
      path: `${file.id}-${safeFileName(file.original_name)}`,
      name: file.original_name, mimeType: file.mime_type, sizeBytes: file.size_bytes,
    })),
  });
}
