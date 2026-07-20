import {
  PYTHON_EXECUTION_TIMEOUT_MS,
  PYTHON_PREPARATION_TIMEOUT_MS,
} from "./constants";
import { createPythonIframeSource } from "./iframe-source";
import { parseBridgeMessage, prepareRunRequest, protocolEnvelope } from "./protocol";
import type {
  BrowserPythonProgress,
  BrowserPythonRunRequest,
  BrowserPythonRunResult,
  BrowserPythonRunner,
} from "./types";
import { BrowserPythonRunnerError } from "./types";
import { createPythonWorkerSource } from "./worker-source";

export type BrowserPythonRunnerOptions = {
  executionTimeoutMs?: number;
  preparationTimeoutMs?: number;
};

type PendingRun = {
  id: string;
  message: ReturnType<typeof protocolEnvelope>;
  transfer: ArrayBuffer[];
  sent: boolean;
  executing: boolean;
  timer: ReturnType<typeof setTimeout>;
  onProgress?: (progress: BrowserPythonProgress) => void;
  resolve: (value: BrowserPythonRunResult | PromiseLike<BrowserPythonRunResult>) => void;
  reject: (reason?: unknown) => void;
};

function identifier() {
  const browserCrypto = globalThis.crypto;
  if (!browserCrypto) {
    throw new BrowserPythonRunnerError("unavailable", "Secure browser randomness is unavailable.");
  }
  if (typeof browserCrypto.randomUUID === "function") return browserCrypto.randomUUID();
  const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function positiveTimeout(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createBrowserPythonRunner(
  options: BrowserPythonRunnerOptions = {},
): BrowserPythonRunner {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) {
    throw new BrowserPythonRunnerError(
      "unavailable",
      "The browser Python runner must be created after the document body is available.",
    );
  }

  const executionTimeoutMs = positiveTimeout(options.executionTimeoutMs, PYTHON_EXECUTION_TIMEOUT_MS);
  const preparationTimeoutMs = positiveTimeout(options.preparationTimeoutMs, PYTHON_PREPARATION_TIMEOUT_MS);
  const nonce = identifier();
  const iframe = document.createElement("iframe");
  let disposed = false;
  let ready = false;
  let pending: PendingRun | null = null;

  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Isolated Python runtime");
  iframe.style.display = "none";
  iframe.srcdoc = createPythonIframeSource(
    nonce,
    window.location.origin,
    createPythonWorkerSource(nonce),
  );

  function post(message: ReturnType<typeof protocolEnvelope>, transfer: ArrayBuffer[] = []) {
    if (!iframe.contentWindow) {
      throw new BrowserPythonRunnerError("unavailable", "The isolated Python frame is unavailable.");
    }
    iframe.contentWindow.postMessage(message, "*", transfer);
  }

  function finish(error?: BrowserPythonRunnerError, result?: BrowserPythonRunResult) {
    const active = pending;
    if (!active) return;
    clearTimeout(active.timer);
    pending = null;
    if (error) active.reject(error);
    else if (result) active.resolve(result);
    else active.reject(new BrowserPythonRunnerError("protocol", "Python returned an empty result."));
  }

  function resetWorker(requestId: string) {
    try { post(protocolEnvelope(nonce, "reset", requestId)); } catch { /* disposal still succeeds */ }
  }

  function expire(id: string, executing: boolean) {
    if (!pending || pending.id !== id) return;
    resetWorker(id);
    const label = executing ? "execution" : "preparation";
    finish(new BrowserPythonRunnerError("timeout", `Python ${label} timed out.`));
  }

  function startTimer(active: PendingRun, milliseconds: number) {
    clearTimeout(active.timer);
    active.timer = setTimeout(() => expire(active.id, active.executing), milliseconds);
  }

  function dispatch() {
    const active = pending;
    if (!active || active.sent || !ready) return;
    try {
      active.sent = true;
      post(active.message, active.transfer);
    } catch (error) {
      finish(error instanceof BrowserPythonRunnerError
        ? error
        : new BrowserPythonRunnerError("unavailable", String(error)));
    }
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== iframe.contentWindow || event.origin !== "null") return;
    const message = parseBridgeMessage(event.data, nonce);
    if (!message) return;
    if (message.type === "ready") {
      ready = true;
      dispatch();
      return;
    }
    const active = pending;
    if (!active || message.requestId !== active.id) return;
    if (message.type === "phase") {
      if (message.phase === "executing" && !active.executing) {
        active.executing = true;
        startTimer(active, executionTimeoutMs);
      }
      try { active.onProgress?.({ phase: message.phase }); } catch { /* consumer callbacks are isolated */ }
      return;
    }
    if (message.type === "bridge-error") {
      finish(new BrowserPythonRunnerError("protocol", message.message));
      return;
    }
    finish(undefined, message.result);
  }

  window.addEventListener("message", onMessage);
  document.body.appendChild(iframe);

  return {
    run(request: BrowserPythonRunRequest, onProgress?: (progress: BrowserPythonProgress) => void) {
      if (disposed) {
        return Promise.reject(new BrowserPythonRunnerError("disposed", "The Python runner was disposed."));
      }
      if (pending) {
        return Promise.reject(new BrowserPythonRunnerError("busy", "The Python runner is already running."));
      }

      let prepared;
      try { prepared = prepareRunRequest(request); }
      catch (error) { return Promise.reject(error); }
      const id = identifier();
      return new Promise((resolve, reject) => {
        const placeholder = setTimeout(() => undefined, preparationTimeoutMs);
        const active: PendingRun = {
          id,
          message: protocolEnvelope(nonce, "run", id, prepared),
          transfer: prepared.inputs.map((input) => input.data),
          sent: false,
          executing: false,
          timer: placeholder,
          onProgress,
          resolve,
          reject,
        };
        pending = active;
        startTimer(active, preparationTimeoutMs);
        dispatch();
      });
    },
    reset() {
      if (disposed) return;
      const id = pending?.id ?? identifier();
      resetWorker(id);
      finish(new BrowserPythonRunnerError("reset", "The Python runner was reset."));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      finish(new BrowserPythonRunnerError("disposed", "The Python runner was disposed."));
      window.removeEventListener("message", onMessage);
      iframe.remove();
    },
  };
}
