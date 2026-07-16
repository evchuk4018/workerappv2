import { describe, expect, it, vi } from "vitest";
import { BraveSearchClient } from "./brave";

describe("Brave LLM Context client", () => {
  it("fails over keys and normalizes grounding for the model and UI", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("X-Subscription-Token");
      if (key === "limited") return new Response("", { status: 429 });
      return Response.json({
        grounding: {
          generic: [{
            title: "A useful Reddit thread",
            url: "https://www.reddit.com/r/example/comments/123",
            snippets: ["First relevant chunk", "Second relevant chunk"],
          }],
        },
      });
    });
    const client = new BraveSearchClient(["limited", "working"], fetcher as typeof fetch);
    const result = await client.search("useful reddit thread", new AbortController().signal);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(result.content)).toMatchObject({
      sources: [{
        title: "A useful Reddit thread",
        snippets: ["First relevant chunk", "Second relevant chunk"],
      }],
    });
    expect(result.sources[0]).toMatchObject({
      url: "https://www.reddit.com/r/example/comments/123",
      snippet: "First relevant chunk Second relevant chunk",
    });
  });

  it("rejects oversized queries without spending a key", async () => {
    const fetcher = vi.fn();
    const client = new BraveSearchClient(["key"], fetcher as typeof fetch);
    await expect(client.search("x".repeat(401), new AbortController().signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rotates away from malformed provider responses", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("X-Subscription-Token");
      if (key === "malformed") return new Response("not json");
      return Response.json({ grounding: { generic: [] } });
    });
    const client = new BraveSearchClient(["malformed", "working"], fetcher as typeof fetch);

    await expect(client.search("current answer", new AbortController().signal)).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
