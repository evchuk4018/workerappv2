import { describe, expect, it } from "vitest";
import { parseAgentExecutionState } from "./agent-state";

describe("saved agent state", () => {
  it("parses resumable tool transcripts", () => {
    expect(parseAgentExecutionState({
      messages: [{ role: "user", content: "Analyze" }],
      content: "", reasoning: "", toolRounds: 1, pythonExecutions: 1,
    }).messages).toEqual([{ role: "user", content: "Analyze" }]);
  });

  it("rejects state outside execution limits", () => {
    expect(() => parseAgentExecutionState({
      messages: [], content: "", reasoning: "", toolRounds: 6, pythonExecutions: 0,
    })).toThrow(/tool-round/i);
  });
});
