import { describe, expect, it } from "vitest";
import { parsePythonToolRequest, pythonResultContent } from "./python-tool";

const FILE_ID = "2d0f55ec-0d65-4a60-b4d9-25855283ef39";

describe("Python tool contract", () => {
  it("normalizes valid requests", () => {
    expect(parsePythonToolRequest("call-1", JSON.stringify({
      code: " print(2 + 2) ",
      packages: ["pandas", "pandas", "openpyxl==3.1.5"],
      input_file_ids: [FILE_ID],
    }))).toEqual({
      callId: "call-1",
      code: "print(2 + 2)",
      packages: ["pandas", "openpyxl==3.1.5"],
      inputFileIds: [FILE_ID],
    });
  });

  it("rejects arbitrary package URLs and unknown file references", () => {
    expect(() => parsePythonToolRequest("call-1", JSON.stringify({
      code: "pass",
      packages: ["https://evil.example/pkg.whl"],
      input_file_ids: ["not-a-uuid"],
    }))).toThrow(/packages/i);
  });

  it("bounds tool output returned to the model", () => {
    const parsed = JSON.parse(pythonResultContent({
      stdout: "x".repeat(40_000), stderr: "", value: null, error: null,
      durationMs: 1.6, resolvedPackages: [], artifacts: [],
    }));
    expect(parsed.stdout).toHaveLength(30_000);
    expect(parsed.duration_ms).toBe(2);
  });
});
