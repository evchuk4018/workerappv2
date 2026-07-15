import { describe, expect, it } from "vitest";
import { parseDeepSeekSseBlock, parseNdjsonBuffer } from "./streaming";

describe("stream parsing", () => {
  it("separates DeepSeek reasoning from answer content", () => {
    expect(
      parseDeepSeekSseBlock(
        'data: {"choices":[{"delta":{"reasoning_content":"Compare options","content":null}}]}',
      ),
    ).toEqual({ reasoning: "Compare options", content: "", done: false });
    expect(
      parseDeepSeekSseBlock(
        'data: {"choices":[{"delta":{"reasoning_content":null,"content":"The answer"}}]}',
      ),
    ).toEqual({ reasoning: "", content: "The answer", done: false });
  });

  it("recognizes the terminal event", () => {
    expect(parseDeepSeekSseBlock("data: [DONE]")).toEqual({
      reasoning: "",
      content: "",
      done: true,
    });
  });

  it("retains incomplete NDJSON data", () => {
    const result = parseNdjsonBuffer(
      '{"type":"content_delta","delta":"Hello"}\n{"type":"done"',
    );
    expect(result.events).toHaveLength(1);
    expect(result.remainder).toBe('{"type":"done"');
  });
});
