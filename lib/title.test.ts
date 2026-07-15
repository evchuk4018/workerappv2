import { describe, expect, it } from "vitest";
import { titleFromMessage } from "./title";

describe("conversation titles", () => {
  it("normalizes whitespace", () => {
    expect(titleFromMessage("  Build\n\n a chat app  ")).toBe("Build a chat app");
  });

  it("truncates long messages cleanly", () => {
    const title = titleFromMessage(
      "Explain how a streaming artificial intelligence response should be rendered in this application",
    );
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(52);
  });
});
