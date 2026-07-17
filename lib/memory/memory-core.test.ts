import { describe, expect, it } from "vitest";
import { boundConversationMessages, estimateTokens, takeWithinBudget, trimToTokenBudget } from "./budget";
import { hasStrongMemoryCue, isExplicitForgetCue } from "./cues";
import { memoryDedupHash, normalizeMemoryContent } from "./identity";
import { memorySettingsFromRow, parseMemorySettings } from "./settings";

describe("memory cues and identity", () => {
  it("detects direct remember and forget language without treating ordinary chat as explicit", () => {
    expect(hasStrongMemoryCue("Remember that I work in UTC." )).toBe(true);
    expect(hasStrongMemoryCue("From now on, keep answers short." )).toBe(true);
    expect(hasStrongMemoryCue("I read a book yesterday." )).toBe(false);
    expect(isExplicitForgetCue("Please erase my old timezone." )).toBe(true);
  });

  it("normalizes stable keys before hashing and keeps categories separate", () => {
    expect(memoryDedupHash("preference", "  DARK   Mode ")).toBe(
      memoryDedupHash("preference", "dark mode"),
    );
    expect(memoryDedupHash("fact", "dark mode")).not.toBe(memoryDedupHash("preference", "dark mode"));
    expect(normalizeMemoryContent("  likes   concise answers ")).toBe("likes concise answers");
    expect(() => normalizeMemoryContent(" ")).toThrow(RangeError);
  });
});

describe("memory budgets and settings", () => {
  it("selects complete records within a deterministic token budget", () => {
    const values = ["aaa", "bbbbbb", "ccc"];
    expect(takeWithinBudget(values, 2, (value) => value)).toEqual(["aaa", "ccc"]);
    expect(estimateTokens("1234567")).toBe(3);
    expect(trimToTokenBudget("123456789", 2)).toMatch(/^12345/);
  });

  it("keeps newest messages when bounding current conversation context", () => {
    const messages = [
      { role: "user" as const, content: "old".repeat(20) },
      { role: "assistant" as const, content: "middle" },
      { role: "user" as const, content: "latest" },
    ];
    expect(boundConversationMessages(messages, 15)).toEqual(messages.slice(1));
  });

  it("defaults all memory layers on and validates read-only mode", () => {
    expect(memorySettingsFromRow(null)).toEqual({
      savedMemoryEnabled: true,
      previousConversationsEnabled: true,
      inferredMemoryEnabled: true,
      writeMode: "read_write",
    });
    expect(parseMemorySettings({
      savedMemoryEnabled: true,
      previousConversationsEnabled: false,
      inferredMemoryEnabled: false,
      writeMode: "read_only",
    }).writeMode).toBe("read_only");
    expect(() => parseMemorySettings({})).toThrow(TypeError);
  });
});
