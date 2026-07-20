import {
  PYTHON_MAX_INPUT_BYTES,
  PYTHON_MAX_OUTPUT_BYTES,
  PYTHON_MAX_OUTPUTS,
  PYTHON_PROTOCOL_CHANNEL,
  PYTHON_PROTOCOL_VERSION,
} from "./constants";
import type {
  BrowserPythonOutput,
  BrowserPythonPhase,
  BrowserPythonRunRequest,
  BrowserPythonRunResult,
} from "./types";
import { BrowserPythonRunnerError } from "./types";

export type TransferInput = { path: string; mimeType: string; data: ArrayBuffer };

export type PreparedRunRequest = {
  code: string;
  packages: string[];
  inputs: TransferInput[];
};

export type BridgeMessage =
  | { type: "ready" }
  | { type: "phase"; requestId: string; phase: BrowserPythonPhase }
  | { type: "result"; requestId: string; result: BrowserPythonRunResult }
  | { type: "bridge-error"; requestId: string; message: string };

const PHASES = new Set<BrowserPythonPhase>([
  "loading", "mounting", "installing", "executing", "collecting",
]);
const PATH_SEGMENT = /^[^\\/:*?"<>|\u0000-\u001f]+$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validation(message: string): never {
  throw new BrowserPythonRunnerError("validation", message);
}

export function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 240) return false;
  const normalized = path.replaceAll("\\", "/");
  if (normalized !== path || path.startsWith("/") || path.endsWith("/")) return false;
  const parts = path.split("/");
  return parts.every((part) => part !== "." && part !== ".." && PATH_SEGMENT.test(part));
}

function cloneBytes(value: ArrayBuffer | Uint8Array) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (value instanceof Uint8Array) return value.slice().buffer;
  return validation("Every Python input must contain an ArrayBuffer or Uint8Array.");
}

export function prepareRunRequest(request: BrowserPythonRunRequest): PreparedRunRequest {
  if (!record(request) || typeof request.code !== "string" || request.code.length > 1_000_000) {
    return validation("Python code must be a string no longer than 1,000,000 characters.");
  }
  const packages = request.packages ?? [];
  if (!Array.isArray(packages) || packages.length > 32
    || packages.some((item) => typeof item !== "string" || !item.trim() || item.length > 512)) {
    return validation("Python packages must be a list of at most 32 non-empty specifications.");
  }
  const rawInputs = request.inputs ?? [];
  if (!Array.isArray(rawInputs) || rawInputs.length > 100) {
    return validation("At most 100 Python input files are allowed.");
  }
  const seen = new Set<string>();
  let total = 0;
  const inputs = rawInputs.map((input) => {
    if (!record(input) || !isSafeRelativePath(input.path) || seen.has(input.path)) {
      return validation("Python input paths must be unique, safe relative paths.");
    }
    seen.add(input.path);
    const data = cloneBytes(input.data as ArrayBuffer | Uint8Array);
    total += data.byteLength;
    const mimeType = input.mimeType ?? "application/octet-stream";
    if (typeof mimeType !== "string" || mimeType.length > 200) {
      return validation("Python input MIME types must be valid strings.");
    }
    return { path: input.path, mimeType, data };
  });
  if (total > PYTHON_MAX_INPUT_BYTES) {
    return validation("Python inputs exceed the 25 MB total limit.");
  }
  return { code: request.code, packages: packages.map((item) => item.trim()), inputs };
}

function parseOutput(value: unknown): BrowserPythonOutput | null {
  if (!record(value) || !exactKeys(value, ["path", "mimeType", "sizeBytes", "data"])) return null;
  if (!isSafeRelativePath(value.path) || typeof value.mimeType !== "string"
    || value.mimeType.length > 200 || !(value.data instanceof ArrayBuffer)
    || typeof value.sizeBytes !== "number" || !Number.isInteger(value.sizeBytes)
    || value.sizeBytes < 0 || value.sizeBytes > PYTHON_MAX_OUTPUT_BYTES
    || value.data.byteLength !== value.sizeBytes) return null;
  return value as BrowserPythonOutput;
}

function parseResult(value: unknown): BrowserPythonRunResult | null {
  if (!record(value) || !exactKeys(value, [
    "stdout", "stderr", "finalValue", "error", "outputs", "resolvedPackages", "durationMs",
  ])) return null;
  if (typeof value.stdout !== "string" || typeof value.stderr !== "string"
    || !(value.finalValue === null || typeof value.finalValue === "string")
    || !(value.error === null || typeof value.error === "string")
    || !Array.isArray(value.outputs) || value.outputs.length > PYTHON_MAX_OUTPUTS
    || !Array.isArray(value.resolvedPackages)
    || value.resolvedPackages.some((item) => typeof item !== "string" || item.length > 512)
    || typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs)
    || value.durationMs < 0) return null;
  const outputs = value.outputs.map(parseOutput);
  if (outputs.some((output) => output === null)) return null;
  return { ...value, outputs } as BrowserPythonRunResult;
}

export function parseBridgeMessage(value: unknown, nonce: string): BridgeMessage | null {
  if (!record(value) || value.channel !== PYTHON_PROTOCOL_CHANNEL
    || value.version !== PYTHON_PROTOCOL_VERSION || value.nonce !== nonce
    || typeof value.type !== "string") return null;
  if (value.type === "ready" && exactKeys(value, ["channel", "version", "nonce", "type"])) {
    return { type: "ready" };
  }
  if (typeof value.requestId !== "string" || !value.requestId) return null;
  if (value.type === "phase" && exactKeys(value, ["channel", "version", "nonce", "type", "requestId", "payload"])
    && record(value.payload) && exactKeys(value.payload, ["phase"])
    && typeof value.payload.phase === "string" && PHASES.has(value.payload.phase as BrowserPythonPhase)) {
    return { type: "phase", requestId: value.requestId, phase: value.payload.phase as BrowserPythonPhase };
  }
  if (value.type === "result" && exactKeys(value, ["channel", "version", "nonce", "type", "requestId", "payload"])) {
    const result = parseResult(value.payload);
    return result ? { type: "result", requestId: value.requestId, result } : null;
  }
  if (value.type === "bridge-error" && exactKeys(value, ["channel", "version", "nonce", "type", "requestId", "payload"])
    && record(value.payload) && exactKeys(value.payload, ["message"])
    && typeof value.payload.message === "string") {
    return { type: "bridge-error", requestId: value.requestId, message: value.payload.message };
  }
  return null;
}

export function protocolEnvelope(nonce: string, type: "run" | "reset", requestId: string, payload?: PreparedRunRequest) {
  return payload
    ? { channel: PYTHON_PROTOCOL_CHANNEL, version: PYTHON_PROTOCOL_VERSION, nonce, type, requestId, payload }
    : { channel: PYTHON_PROTOCOL_CHANNEL, version: PYTHON_PROTOCOL_VERSION, nonce, type, requestId };
}
