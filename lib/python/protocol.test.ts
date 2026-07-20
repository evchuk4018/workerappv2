import { describe, expect, it } from "vitest";
import {
  PYTHON_MAX_INPUT_BYTES,
  PYTHON_PROTOCOL_CHANNEL,
  PYTHON_PROTOCOL_VERSION,
} from "./constants";
import { isSafeRelativePath, parseBridgeMessage, prepareRunRequest } from "./protocol";
import { BrowserPythonRunnerError } from "./types";

describe("browser Python protocol", () => {
  it("copies valid inputs and preserves nested relative paths", () => {
    const original = new Uint8Array([1, 2, 3]);
    const prepared = prepareRunRequest({
      code: "print('ok')",
      packages: [" pandas>=2 "],
      inputs: [{ path: "datasets/example.csv", data: original, mimeType: "text/csv" }],
    });

    original[0] = 9;
    expect(prepared.packages).toEqual(["pandas>=2"]);
    expect(new Uint8Array(prepared.inputs[0].data)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it.each([
    "", "/absolute.csv", "../secret.csv", "folder/../../secret", "folder\\file.csv",
    "folder/", "./file.csv", "bad:file.csv",
  ])("rejects unsafe input path %j", (path) => {
    expect(isSafeRelativePath(path)).toBe(false);
    expect(() => prepareRunRequest({ code: "", inputs: [{ path, data: new ArrayBuffer(0) }] }))
      .toThrow(BrowserPythonRunnerError);
  });

  it("enforces unique paths and the 25 MB aggregate input limit", () => {
    expect(() => prepareRunRequest({
      code: "",
      inputs: [
        { path: "same.csv", data: new ArrayBuffer(1) },
        { path: "same.csv", data: new ArrayBuffer(1) },
      ],
    })).toThrow(/unique/);
    expect(() => prepareRunRequest({
      code: "",
      inputs: [{ path: "large.bin", data: new ArrayBuffer(PYTHON_MAX_INPUT_BYTES + 1) }],
    })).toThrow(/25 MB/);
  });

  it("accepts only exact, nonce-bound result schemas", () => {
    const nonce = "nonce";
    const message = {
      channel: PYTHON_PROTOCOL_CHANNEL,
      version: PYTHON_PROTOCOL_VERSION,
      nonce,
      type: "result",
      requestId: "request",
      payload: {
        stdout: "done\n",
        stderr: "",
        finalValue: "42",
        error: null,
        outputs: [{
          path: "plot.png",
          mimeType: "image/png",
          sizeBytes: 2,
          data: new Uint8Array([1, 2]).buffer,
        }],
        resolvedPackages: ["matplotlib==3.10.5"],
        durationMs: 10,
      },
    };

    expect(parseBridgeMessage(message, nonce)).toMatchObject({
      type: "result",
      requestId: "request",
      result: { finalValue: "42" },
    });
    expect(parseBridgeMessage({ ...message, nonce: "wrong" }, nonce)).toBeNull();
    expect(parseBridgeMessage({ ...message, unexpected: true }, nonce)).toBeNull();
    expect(parseBridgeMessage({
      ...message,
      payload: { ...message.payload, outputs: [{ ...message.payload.outputs[0], sizeBytes: 3 }] },
    }, nonce)).toBeNull();
  });
});
