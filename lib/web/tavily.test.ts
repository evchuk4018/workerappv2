import { describe, expect, it, vi } from "vitest";
import { TavilyExtractClient } from "./tavily";

function extracted(content: string) {
  return Response.json({ results: [{ url: "https://example.com/page", raw_content: content }] });
}

describe("Tavily page extraction", () => {
  it("returns ordinary pages as full Markdown", async () => {
    const fetcher = vi.fn(async () => extracted("# Complete page\n\nBody"));
    const client = new TavilyExtractClient(["key"], fetcher as typeof fetch);
    const result = await client.read(
      "https://example.com/page",
      "What does it say?",
      new AbortController().signal,
    );

    expect(result.mode).toBe("full");
    expect(result.content).toContain("# Complete page");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-extracts large pages as focused chunks", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(extracted("x".repeat(60_001)))
      .mockResolvedValueOnce(extracted("Relevant focused chunks"));
    const client = new TavilyExtractClient(["key"], fetcher as typeof fetch);
    const result = await client.read(
      "https://example.com/page",
      "Find the conclusion",
      new AbortController().signal,
    );

    expect(result).toMatchObject({ mode: "focused", content: "Relevant focused chunks" });
    const secondBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(secondBody).toMatchObject({ query: "Find the conclusion", chunks_per_source: 5 });
  });

  it("caps focused extraction at the page limit", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(extracted("x".repeat(60_001)))
      .mockResolvedValueOnce(extracted("y".repeat(70_000)));
    const client = new TavilyExtractClient(["key"], fetcher as typeof fetch);

    const result = await client.read(
      "https://example.com/page",
      "Find the conclusion",
      new AbortController().signal,
    );

    expect(result.mode).toBe("focused");
    expect(result.content).toHaveLength(60_000);
  });

  it("returns a marked partial page if focused extraction fails", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(extracted("x".repeat(60_001)))
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    const client = new TavilyExtractClient(["key"], fetcher as typeof fetch);
    const result = await client.read(
      "https://example.com/page",
      "Find the conclusion",
      new AbortController().signal,
    );

    expect(result.mode).toBe("partial");
    expect(result.content.length).toBeLessThan(60_100);
    expect(result.content).toContain("Page truncated because focused extraction failed");
  });
});
