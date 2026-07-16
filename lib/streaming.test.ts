import { describe, expect, it } from "vitest";
import { parseDeepSeekSseBlock, parseNdjsonBuffer } from "./streaming";

describe("stream parsing", () => {
  it("separates DeepSeek reasoning from answer content", () => {
    expect(
      parseDeepSeekSseBlock(
        'data: {"choices":[{"delta":{"reasoning_content":"Compare options","content":null}}]}',
      ),
    ).toEqual({
      reasoning: "Compare options",
      content: "",
      toolCalls: [],
      finishReason: null,
      done: false,
    });
    expect(
      parseDeepSeekSseBlock(
        'data: {"choices":[{"delta":{"reasoning_content":null,"content":"The answer"}}]}',
      ),
    ).toEqual({
      reasoning: "",
      content: "The answer",
      toolCalls: [],
      finishReason: null,
      done: false,
    });
  });

  it("recognizes the terminal event", () => {
    expect(parseDeepSeekSseBlock("data: [DONE]")).toEqual({
      reasoning: "",
      content: "",
      toolCalls: [],
      finishReason: null,
      done: true,
    });
  });

  it("parses streamed tool call fragments", () => {
    expect(parseDeepSeekSseBlock(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"web_search","arguments":"{\\"query\\":"}}]},"finish_reason":null}]}',
    )).toMatchObject({
      toolCalls: [{ index: 0, id: "call-1", name: "web_search", arguments: '{"query":' }],
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
