import { describe, expect, it } from "vitest";
import {
  buildProviderMessages,
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
  it("does not add messages when the prompt is blank", () => {
    const history = [{ role: "user" as const, content: "Hello" }];
    expect(buildProviderMessages(history, " \n")).toEqual(history);
  });

  it("injects before user turns 1, 6, and 11", () => {
    const history = Array.from({ length: 11 }, (_, index) => [
      { role: "user" as const, content: `user-${index + 1}` },
      { role: "assistant" as const, content: `assistant-${index + 1}` },
    ]).flat();

    const result = buildProviderMessages(history, "Be concise");
    expect(result
      .map((message, index) => ({ message, next: result[index + 1] }))
      .filter(({ message }) => message.role === "system")
      .map(({ next }) => next.content))
      .toEqual(["user-1", "user-6", "user-11"]);
  });

  it("counts only user turns and preserves consecutive-message order", () => {
    const history = [
      { role: "assistant" as const, content: "stopped output" },
      ...Array.from({ length: 6 }, (_, index) => ({
        role: "user" as const,
        content: `user-${index + 1}`,
      })),
    ];

    const result = buildProviderMessages(history, "Prompt");
    expect(result.filter((message) => message.role !== "system")).toEqual(history);
    expect(result.filter((message) => message.role === "system")).toHaveLength(2);
    expect(result.at(-2)).toEqual({ role: "system", content: "Prompt" });
    expect(result.at(-1)).toEqual({ role: "user", content: "user-6" });
  });
});
