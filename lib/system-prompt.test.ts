import { describe, expect, it } from "vitest";
import {
  buildProviderMessages,
  MARKDOWN_SYSTEM_PROMPT,
  MAX_SYSTEM_PROMPT_LENGTH,
  normalizeSystemPrompt,
} from "./system-prompt";

describe("system prompt settings", () => {
  it("normalizes blank input without changing non-empty formatting", () => {
    expect(normalizeSystemPrompt("  \n ")).toBe("");
    expect(normalizeSystemPrompt("  Keep this spacing\n")).toBe("  Keep this spacing\n");
  });

  it("enforces the maximum prompt length", () => {
    expect(normalizeSystemPrompt("a".repeat(MAX_SYSTEM_PROMPT_LENGTH))).toHaveLength(
      MAX_SYSTEM_PROMPT_LENGTH,
    );
    expect(() => normalizeSystemPrompt("a".repeat(MAX_SYSTEM_PROMPT_LENGTH + 1))).toThrow(
      RangeError,
    );
  });
});

describe("system prompt injection", () => {
  it("always adds the built-in prompt first when the custom prompt is blank", () => {
    const history = [{ role: "user" as const, content: "Hello" }];
    expect(buildProviderMessages(history, " \n")).toEqual([
      { role: "system", content: MARKDOWN_SYSTEM_PROMPT },
      ...history,
    ]);
  });

  it("places the saved custom prompt after the built-in guidance", () => {
    const result = buildProviderMessages([], "  Keep this spacing\n");
    expect(result).toEqual([
      {
        role: "system",
        content: `${MARKDOWN_SYSTEM_PROMPT}\n\n  Keep this spacing\n`,
      },
    ]);
  });

  it("adds exactly one system message and preserves conversation order", () => {
    const history = [
      { role: "assistant" as const, content: "stopped output" },
      ...Array.from({ length: 11 }, (_, index) => ({
        role: "user" as const,
        content: `user-${index + 1}`,
      })),
    ];

    const result = buildProviderMessages(history, "Prompt");
    expect(result.filter((message) => message.role === "system")).toHaveLength(1);
    expect(result.slice(1)).toEqual(history);
  });
});
