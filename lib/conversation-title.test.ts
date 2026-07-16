import { describe, expect, it, vi } from "vitest";
import {
  buildTitleRequest,
  cleanGeneratedTitle,
  generateConversationTitle,
} from "./conversation-title";

const transcript = [
  { role: "user" as const, content: "Help me build authentication" },
  { role: "assistant" as const, content: "Start with session cookies." },
];

describe("AI conversation titles", () => {
  it("uses DeepSeek V4 Flash without thinking", () => {
    const request = buildTitleRequest(transcript);

    expect(request).toMatchObject({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
      stream: false,
      max_tokens: 32,
    });
    expect(request.messages[0].content).toContain("3-7 word topic phrase");
    expect(request.messages[0].content).toContain("language of the first user message");
    expect(request.messages[1].content).toBe(JSON.stringify(transcript));
  });

  it("cleans labels and Markdown and enforces the sidebar limit", () => {
    expect(cleanGeneratedTitle('**Title: Secure Session Authentication.**')).toBe(
      "Secure Session Authentication",
    );
    const title = cleanGeneratedTitle(
      "A very long generated conversation title that cannot fit inside the compact sidebar display",
    );
    expect(title?.endsWith("…")).toBe(true);
    expect(title?.length).toBeLessThanOrEqual(52);
  });

  it("returns null for an empty model response", () => {
    expect(cleanGeneratedTitle("  `**`  ")).toBeNull();
  });

  it("sends only the dedicated prompt and transcript", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ choices: [{ message: { content: "Session Authentication" } }] });
    });

    await expect(generateConversationTitle(
      transcript,
      "secret",
      fetcher as unknown as typeof fetch,
    )).resolves.toBe(
      "Session Authentication",
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init?.headers).toEqual({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual(buildTitleRequest(transcript));
  });
});
