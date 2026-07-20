import { PYTHON_PROTOCOL_CHANNEL, PYTHON_PROTOCOL_VERSION } from "./constants";

function scriptLiteral(value: string) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function createPythonIframeSource(
  nonce: string,
  parentOrigin: string,
  workerSource: string,
) {
  const script = `
const CHANNEL = ${JSON.stringify(PYTHON_PROTOCOL_CHANNEL)};
const VERSION = ${PYTHON_PROTOCOL_VERSION};
const NONCE = ${JSON.stringify(nonce)};
const PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
const WORKER_SOURCE = ${scriptLiteral(workerSource)};
let worker = null;
let workerError = null;
let activeRequestId = null;

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const envelope = (value, type, keys) => record(value) && exact(value, keys)
  && value.channel === CHANNEL && value.version === VERSION && value.nonce === NONCE && value.type === type
  && typeof value.requestId === "string" && value.requestId.length > 0;

function toParent(message, transfer = []) {
  parent.postMessage(message, PARENT_ORIGIN, transfer);
}

function bridgeError(requestId, message) {
  toParent({ channel: CHANNEL, version: VERSION, nonce: NONCE, type: "bridge-error", requestId,
    payload: { message } });
}

function createWorker() {
  workerError = null;
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  try {
    worker = new Worker(url, { type: "module", name: "workerapp-python" });
  } catch (error) {
    worker = null;
    workerError = error instanceof Error ? error.message : String(error);
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!worker) return;
  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (!record(message) || message.channel !== CHANNEL || message.version !== VERSION || message.nonce !== NONCE
      || typeof message.requestId !== "string" || message.requestId !== activeRequestId) return;
    const transfer = message.type === "result" && record(message.payload) && Array.isArray(message.payload.outputs)
      ? message.payload.outputs.map((output) => output && output.data).filter((data) => data instanceof ArrayBuffer)
      : [];
    toParent(message, transfer);
    if (message.type === "result" || message.type === "bridge-error") activeRequestId = null;
  });
  worker.addEventListener("error", (event) => {
    const requestId = activeRequestId;
    activeRequestId = null;
    if (requestId) bridgeError(requestId, event.message || "The Python worker failed to load.");
  });
}

function resetWorker() {
  if (worker) worker.terminate();
  worker = null;
  activeRequestId = null;
  createWorker();
}

window.addEventListener("message", (event) => {
  if (event.source !== parent || event.origin !== PARENT_ORIGIN || !record(event.data)) return;
  const message = event.data;
  if (envelope(message, "reset", ["channel", "version", "nonce", "type", "requestId"])) {
    resetWorker();
    return;
  }
  if (!envelope(message, "run", ["channel", "version", "nonce", "type", "requestId", "payload"])) return;
  if (!worker) {
    bridgeError(message.requestId, workerError || "The Python worker is unavailable.");
    return;
  }
  if (activeRequestId) {
    bridgeError(message.requestId, "The Python worker is already running.");
    return;
  }
  activeRequestId = message.requestId;
  const transfer = record(message.payload) && Array.isArray(message.payload.inputs)
    ? message.payload.inputs.map((input) => input && input.data).filter((data) => data instanceof ArrayBuffer)
    : [];
  worker.postMessage(message, transfer);
});

createWorker();
toParent({ channel: CHANNEL, version: VERSION, nonce: NONCE, type: "ready" });
`;
  return `<!doctype html><meta charset="utf-8"><script>${script}<\/script>`;
}
