import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { resumeAgentState } from "@/lib/deepseek/agent";
import { parseAgentExecutionState } from "@/lib/deepseek/agent-state";
import {
  parsePendingPythonRequest,
  parsePythonResultSubmission,
  toPythonToolResult,
} from "@/lib/deepseek/python-result";
import { pythonResultContent } from "@/lib/deepseek/python-tool";
import { isModelPreset } from "@/lib/models";
import { normalizeReasoningBlocks } from "@/lib/reasoning-block";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import {
  normalizeToolActivities,
  type PythonToolActivity,
  upsertToolActivity,
} from "@/lib/tool-activity";
import { createAgentRunStream } from "../run-stream";

interface ContinueBody { pythonResult?: unknown }
function asJson(value: unknown) { return value as Json; }
function splitPath(path: string) {
  const index = path.lastIndexOf("/");
  return { folder: path.slice(0, index), name: path.slice(index + 1) };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let body: ContinueBody = {};
  try { body = (await request.json()) as ContinueBody; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const { data: run } = await auth.supabase.from("agent_runs").select("*").eq("id", id).maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "ready" && run.status !== "awaiting_python") {
    const message = run.status === "streaming" ? "This run is already active." : "This run is already finished.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (!run.assistant_message_id) {
    return NextResponse.json({ error: "Assistant message is unavailable." }, { status: 409 });
  }

  const [{ data: assistant }, { data: conversation }] = await Promise.all([
    auth.supabase.from("messages")
      .select("model_preset,tool_activity,reasoning_blocks")
      .eq("id", run.assistant_message_id).maybeSingle(),
    auth.supabase.from("conversations")
      .select("title,title_finalized_at").eq("id", run.conversation_id).maybeSingle(),
  ]);
  if (!assistant || !conversation || !isModelPreset(assistant.model_preset)) {
    return NextResponse.json({ error: "Run context is unavailable." }, { status: 409 });
  }

  let state;
  try { state = parseAgentExecutionState(run.provider_state); }
  catch { return NextResponse.json({ error: "Saved run state is invalid." }, { status: 500 }); }
  let activities = normalizeToolActivities(assistant.tool_activity);

  if (run.status === "awaiting_python") {
    let submission;
    let pending;
    try {
      submission = parsePythonResultSubmission(body.pythonResult);
      pending = parsePendingPythonRequest(run.pending_tool_call);
    } catch (caught) {
      return NextResponse.json({ error: caught instanceof Error ? caught.message : "Invalid Python result." }, { status: 400 });
    }
    if (!run.pending_call_token || submission.callToken !== run.pending_call_token) {
      return NextResponse.json({ error: "Python result token is stale." }, { status: 409 });
    }
    if (!submission.artifactFileIds.length && submission.error) {
      const { data: abandoned } = await auth.supabase.from("chat_files")
        .select("id,object_path").eq("agent_run_id", run.id).eq("kind", "artifact")
        .eq("call_token", submission.callToken);
      const paths = (abandoned ?? []).map((file) => file.object_path);
      if (paths.length) await auth.supabase.storage.from("chat-files").remove(paths);
      if ((abandoned ?? []).length) {
        await auth.supabase.from("chat_files").delete()
          .eq("agent_run_id", run.id).eq("call_token", submission.callToken);
      }
    }
    const { data: artifactRows, error: artifactError } = submission.artifactFileIds.length
      ? await auth.supabase.from("chat_files")
        .select("id,object_path,original_name,mime_type,size_bytes")
        .eq("agent_run_id", run.id).eq("kind", "artifact")
        .eq("call_token", submission.callToken)
        .in("id", submission.artifactFileIds)
      : { data: [], error: null };
    if (artifactError) {
      return NextResponse.json({ error: "Unable to verify generated files." }, { status: 500 });
    }
    const byId = new Map((artifactRows ?? []).map((file) => [file.id, file]));
    let ordered = submission.artifactFileIds.flatMap((fileId) => {
      const file = byId.get(fileId);
      return file ? [file] : [];
    });
    let storageFailure = ordered.length !== submission.artifactFileIds.length;
    for (const file of ordered) {
      const { folder, name } = splitPath(file.object_path);
      const { data, error } = await auth.supabase.storage.from("chat-files")
        .list(folder, { search: name, limit: 10 });
      const stored = data?.find((item) => item.name === name);
      const storedType = String(stored?.metadata?.mimetype ?? "").toLowerCase();
      if (error || !stored || Number(stored.metadata?.size) !== file.size_bytes
        || (storedType && storedType !== file.mime_type.toLowerCase())) storageFailure = true;
    }
    if (storageFailure) {
      const paths = ordered.map((file) => file.object_path);
      if (paths.length) await auth.supabase.storage.from("chat-files").remove(paths);
      if (submission.artifactFileIds.length) {
        await auth.supabase.from("chat_files").delete().in("id", submission.artifactFileIds)
          .eq("agent_run_id", run.id).eq("call_token", submission.callToken);
      }
      submission.artifactFileIds = [];
      submission.error = submission.error
        ? `${submission.error}\nGenerated files could not be verified.`
        : "Generated files could not be verified.";
      ordered = [];
    }
    let result;
    try { result = toPythonToolResult(submission, ordered); }
    catch (caught) {
      return NextResponse.json({ error: caught instanceof Error ? caught.message : "Invalid artifacts." }, { status: 400 });
    }
    try { state = resumeAgentState(state, pending.callId, pythonResultContent(result)); }
    catch (caught) {
      return NextResponse.json({ error: caught instanceof Error ? caught.message : "Stale tool result." }, { status: 409 });
    }
    const previous = activities.find((activity) => activity.id === pending.callId);
    const completed: PythonToolActivity = {
      id: pending.callId, kind: "python", provider: "pyodide",
      status: submission.error ? "error" : "completed", phase: "completed",
      code: pending.code, packages: pending.packages,
      installed_packages: submission.resolvedPackages,
      stdout: submission.stdout, stderr: submission.stderr,
      ...(submission.value ? { final_value: submission.value } : {}),
      ...(submission.error ? { error: submission.error } : {}),
      duration_ms: submission.durationMs,
      artifacts: ordered.map((file) => ({
        id: file.id, name: file.original_name, mime_type: file.mime_type, size_bytes: file.size_bytes,
        download_url: `/api/files/${file.id}/content?download=1`,
        ...((file.mime_type === "image/png" || file.mime_type === "image/jpeg")
          ? { preview_url: `/api/files/${file.id}/content` }
          : {}),
      })),
      round_index: previous?.round_index,
      started_at: previous?.started_at ?? new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
    activities = upsertToolActivity(activities, completed);
  } else if (body.pythonResult !== undefined) {
    return NextResponse.json({ error: "This run is not waiting for a Python result." }, { status: 409 });
  }

  const leaseToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await auth.supabase.from("agent_runs").update({
    status: "streaming", provider_state: asJson(state), pending_tool_call: null,
    pending_call_token: null, lease_token: leaseToken,
    lease_expires_at: new Date(Date.now() + 90_000).toISOString(),
    version: run.version + 1, error: null,
  }).eq("id", run.id).eq("status", run.status).eq("version", run.version).select("*").maybeSingle();
  if (claimError || !claimed) {
    return NextResponse.json({ error: "Another client continued this run first." }, { status: 409 });
  }
  const { error: messageError } = await auth.supabase.from("messages")
    .update({ status: "streaming", tool_activity: activities })
    .eq("id", run.assistant_message_id);
  if (messageError) {
    await auth.supabase.from("agent_runs").update({
      status: run.status, provider_state: run.provider_state,
      pending_tool_call: run.pending_tool_call, pending_call_token: run.pending_call_token,
      lease_token: null, lease_expires_at: null, version: claimed.version + 1,
    }).eq("id", claimed.id).eq("status", "streaming")
      .eq("version", claimed.version).eq("lease_token", leaseToken);
    return NextResponse.json({ error: "Unable to persist the resumed response." }, { status: 500 });
  }

  return createAgentRunStream({
    request, supabase: auth.supabase, run: claimed, state,
    preset: assistant.model_preset, title: conversation.title,
    titleFinalizedAt: conversation.title_finalized_at,
    activities, reasoningBlocks: normalizeReasoningBlocks(assistant.reasoning_blocks),
  });
}
