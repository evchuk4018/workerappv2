import { describe, expect, it } from "vitest";
import { parsePendingPythonRequest, parsePythonResultSubmission, toPythonToolResult } from "./python-result";

const CALL_TOKEN = "6088595b-fbc7-4620-83e3-672662d7cfa0";
const FILE_ID = "2d0f55ec-0d65-4a60-b4d9-25855283ef39";

describe("Python result contract", () => {
  it("accepts a bounded result and rounds its duration", () => {
    expect(parsePythonResultSubmission({
      callToken: CALL_TOKEN,
      stdout: "4\n",
      stderr: "",
      value: "4",
      error: null,
      durationMs: 18.6,
      resolvedPackages: ["numpy"],
      artifactFileIds: [FILE_ID],
    })).toMatchObject({ durationMs: 19, artifactFileIds: [FILE_ID] });
  });

  it("rejects forged artifact identifiers and excessive runtimes", () => {
    const base = {
      callToken: CALL_TOKEN, stdout: "", stderr: "", value: null, error: null,
      durationMs: 1, resolvedPackages: [], artifactFileIds: ["not-a-uuid"],
    };
    expect(() => parsePythonResultSubmission(base)).toThrow(/artifact ids/i);
    expect(() => parsePythonResultSubmission({
      ...base, artifactFileIds: [], durationMs: 120_001,
    })).toThrow(/duration/i);
  });

  it("requires valid input IDs in persisted pending requests", () => {
    expect(parsePendingPythonRequest({
      callId: "call-1", code: "print('ok')", packages: [], inputFileIds: [FILE_ID],
    }).inputFileIds).toEqual([FILE_ID]);
    expect(() => parsePendingPythonRequest({
      callId: "call-1", code: "pass", packages: [], inputFileIds: ["../secret"],
    })).toThrow(/invalid/i);
  });

  it("refuses to report artifacts whose metadata was not found", () => {
    const submission = parsePythonResultSubmission({
      callToken: CALL_TOKEN, stdout: "", stderr: "", value: null, error: null,
      durationMs: 1, resolvedPackages: [], artifactFileIds: [FILE_ID],
    });
    expect(() => toPythonToolResult(submission, [])).toThrow(/unavailable/i);
  });
});
