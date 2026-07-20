import type { PythonToolRequest, PythonToolResult } from "./python-tool";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PythonResultSubmission {
  callToken: string;
  stdout: string;
  stderr: string;
  value: string | null;
  error: string | null;
  durationMs: number;
  resolvedPackages: string[];
  artifactFileIds: string[];
}

function boundedText(value: unknown, limit: number, label: string): string;
function boundedText(value: unknown, limit: number, label: string, nullable: true): string | null;
function boundedText(value: unknown, limit: number, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > limit) {
    throw new TypeError(`${label} must be a string no longer than ${limit} characters.`);
  }
  return value;
}

function strings(value: unknown, limit: number, label: string) {
  if (!Array.isArray(value) || value.length > limit || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${label} must contain at most ${limit} strings.`);
  }
  return value.map((item) => (item as string).trim()).filter(Boolean);
}

export function parsePythonResultSubmission(value: unknown): PythonResultSubmission {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Python result must be an object.");
  }
  const item = value as Record<string, unknown>;
  const callToken = boundedText(item.callToken, 64, "callToken");
  const durationMs = item.durationMs;
  if (!UUID.test(callToken) || typeof durationMs !== "number" || !Number.isFinite(durationMs)
    || durationMs < 0 || durationMs > 120_000) {
    throw new TypeError("Python call token or duration is invalid.");
  }
  const artifactFileIds = strings(item.artifactFileIds, 5, "artifactFileIds");
  if (artifactFileIds.some((id) => !UUID.test(id))) {
    throw new TypeError("Artifact IDs must be UUIDs returned by the upload API.");
  }
  return {
    callToken,
    stdout: boundedText(item.stdout, 30_000, "stdout"),
    stderr: boundedText(item.stderr, 20_000, "stderr"),
    value: boundedText(item.value, 10_000, "value", true),
    error: boundedText(item.error, 20_000, "error", true),
    durationMs: Math.round(durationMs),
    resolvedPackages: strings(item.resolvedPackages, 30, "resolvedPackages"),
    artifactFileIds,
  };
}

export function parsePendingPythonRequest(value: unknown): PythonToolRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Pending Python request is missing.");
  }
  const item = value as Record<string, unknown>;
  const callId = boundedText(item.callId, 200, "callId");
  const code = boundedText(item.code, 50_000, "code");
  const packages = strings(item.packages, 10, "packages");
  const inputFileIds = strings(item.inputFileIds, 20, "inputFileIds");
  if (!callId || !code || inputFileIds.some((id) => !UUID.test(id))) {
    throw new TypeError("Pending Python request is invalid.");
  }
  return { callId, code, packages, inputFileIds };
}

export function toPythonToolResult(
  submission: PythonResultSubmission,
  artifacts: Array<{ id: string; original_name: string; mime_type: string; size_bytes: number }>,
): PythonToolResult {
  if (artifacts.length !== submission.artifactFileIds.length) {
    throw new TypeError("One or more generated files are unavailable.");
  }
  return {
    stdout: submission.stdout, stderr: submission.stderr, value: submission.value,
    error: submission.error, durationMs: submission.durationMs,
    resolvedPackages: submission.resolvedPackages,
    artifacts: artifacts.map((file) => ({
      fileId: file.id, name: file.original_name, mimeType: file.mime_type, sizeBytes: file.size_bytes,
    })),
  };
}
