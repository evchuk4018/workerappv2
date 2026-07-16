import { afterEach, describe, expect, it, vi } from "vitest";
import { persistStoppedGeneration } from "./stop-generation";

describe("stopped generation persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends partial output and returns the generated title", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ ok: true, title: "Partial response title" });
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(persistStoppedGeneration({
      controller: new AbortController(),
      assistantId: "assistant-1",
      content: "Partial answer",
      reasoning: "Partial reasoning",
      activities: [],
      startedAt: Date.now(),
    })).resolves.toBe("Partial response title");
    expect(fetcher).toHaveBeenCalledWith("/api/messages/assistant-1/stop", expect.objectContaining({
      method: "POST",
      keepalive: true,
    }));
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ content: "Partial answer", reasoning: "Partial reasoning", toolActivity: [] });
  });
});
