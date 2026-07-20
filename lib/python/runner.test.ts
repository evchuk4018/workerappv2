import { afterEach, describe, expect, it, vi } from "vitest";
import { PYODIDE_VERSION, PYTHON_PROTOCOL_CHANNEL, PYTHON_PROTOCOL_VERSION } from "./constants";
import { createBrowserPythonRunner } from "./runner";
import { BrowserPythonRunnerError } from "./types";

type Listener = (event: MessageEvent) => void;

function browserHarness() {
  const listeners = new Set<Listener>();
  const attributes = new Map<string, string>();
  const contentWindow = { postMessage: vi.fn() };
  const iframe = {
    contentWindow,
    setAttribute: vi.fn((name: string, value: string) => attributes.set(name, value)),
    style: {} as Record<string, string>,
    srcdoc: "",
    remove: vi.fn(),
  };
  const fakeWindow = {
    location: { origin: "https://app.example" },
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (type === "message") listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      if (type === "message") listeners.delete(listener);
    }),
  };
  const body = { appendChild: vi.fn() };
  const fakeDocument = { body, createElement: vi.fn(() => iframe) };
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);

  function nonce() {
    const match = iframe.srcdoc.match(/const NONCE = "([^"]+)"/);
    if (!match) throw new Error("Nonce was not embedded in the frame.");
    return match[1];
  }
  function emit(data: unknown, source: unknown = contentWindow, origin = "null") {
    for (const listener of listeners) listener({ data, source, origin } as MessageEvent);
  }
  function ready() {
    emit({ channel: PYTHON_PROTOCOL_CHANNEL, version: PYTHON_PROTOCOL_VERSION, nonce: nonce(), type: "ready" });
  }
  return { attributes, body, contentWindow, emit, iframe, nonce, ready };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser Python runner", () => {
  it("creates an opaque-origin sandbox with a pinned Blob module worker", () => {
    const harness = browserHarness();
    const runner = createBrowserPythonRunner();

    expect(harness.attributes.get("sandbox")).toBe("allow-scripts");
    expect(harness.attributes.get("sandbox")).not.toContain("allow-same-origin");
    expect(harness.body.appendChild).toHaveBeenCalledWith(harness.iframe);
    expect(harness.iframe.srcdoc).toContain("new Worker(url, { type: \"module\"");
    expect(harness.iframe.srcdoc).toContain(`pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`);
    runner.dispose();
  });

  it("transfers inputs and resolves a strictly validated result", async () => {
    const harness = browserHarness();
    const runner = createBrowserPythonRunner();
    const progress = vi.fn();
    const pending = runner.run({
      code: "40 + 2",
      inputs: [{ path: "input.txt", data: new Uint8Array([7]) }],
    }, progress);
    harness.ready();

    const [runMessage, target, transfer] = harness.contentWindow.postMessage.mock.calls[0];
    expect(target).toBe("*");
    expect(transfer).toHaveLength(1);
    harness.emit({
      channel: PYTHON_PROTOCOL_CHANNEL,
      version: PYTHON_PROTOCOL_VERSION,
      nonce: harness.nonce(),
      type: "phase",
      requestId: runMessage.requestId,
      payload: { phase: "executing" },
    });
    harness.emit({
      channel: PYTHON_PROTOCOL_CHANNEL,
      version: PYTHON_PROTOCOL_VERSION,
      nonce: harness.nonce(),
      type: "result",
      requestId: runMessage.requestId,
      payload: {
        stdout: "",
        stderr: "",
        finalValue: "42",
        error: null,
        outputs: [],
        resolvedPackages: [],
        durationMs: 5,
      },
    });

    await expect(pending).resolves.toMatchObject({ finalValue: "42" });
    expect(progress).toHaveBeenCalledWith({ phase: "executing" });
    runner.dispose();
  });

  it("ignores wrong sources and resets the worker after the 30-second execution timeout", async () => {
    vi.useFakeTimers();
    const harness = browserHarness();
    const runner = createBrowserPythonRunner({ executionTimeoutMs: 30_000 });
    const pending = runner.run({ code: "while True: pass" });
    harness.ready();
    const runMessage = harness.contentWindow.postMessage.mock.calls[0][0];
    harness.emit({
      channel: PYTHON_PROTOCOL_CHANNEL,
      version: PYTHON_PROTOCOL_VERSION,
      nonce: harness.nonce(),
      type: "phase",
      requestId: runMessage.requestId,
      payload: { phase: "executing" },
    }, { postMessage: vi.fn() });
    vi.advanceTimersByTime(29_999);
    expect(harness.contentWindow.postMessage).toHaveBeenCalledTimes(1);

    harness.emit({
      channel: PYTHON_PROTOCOL_CHANNEL,
      version: PYTHON_PROTOCOL_VERSION,
      nonce: harness.nonce(),
      type: "phase",
      requestId: runMessage.requestId,
      payload: { phase: "executing" },
    });
    vi.advanceTimersByTime(30_000);

    await expect(pending).rejects.toMatchObject({ code: "timeout" } satisfies Partial<BrowserPythonRunnerError>);
    expect(harness.contentWindow.postMessage.mock.calls[1][0]).toMatchObject({
      type: "reset",
      requestId: runMessage.requestId,
    });
    runner.dispose();
  });
});
