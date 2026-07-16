import { describe, expect, it, vi } from "vitest";
import { BraveSearchClient } from "@/lib/web/brave";
import { TavilyExtractClient } from "@/lib/web/tavily";
import type { AgentToolCall } from "./tool-types";
import { WebToolExecutor } from "./web-tools";

function searchCall(index: number): AgentToolCall {
  return {
    id: `call-${index}`,
    type: "function",
    function: { name: "web_search", arguments: `{"query":"query ${index}"}` },
  };
}

function readCall(index: number): AgentToolCall {
  return {
    id: `read-${index}`,
    type: "function",
    function: {
      name: "read_webpage",
      arguments: `{"url":"https://example.com/${index}","focus":"Find the answer"}`,
    },
  };
}

describe("per-round web tool allowances", () => {
  it("limits one round to three searches and resets for the next reasoning round", async () => {
    const fetcher = vi.fn(async () => Response.json({ grounding: { generic: [] } }));
    const activities: Array<{ id: string; status: string; error?: string }> = [];
    const executor = new WebToolExecutor(
      new BraveSearchClient(["key"], fetcher as typeof fetch),
      new TavilyExtractClient([], fetcher as typeof fetch),
      new AbortController().signal,
      (activity) => activities.push(activity),
    );

    const first = await executor.executeRound([1, 2, 3, 4].map(searchCall));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(first[3].content).error).toContain("allowance of 3 searches");

    await executor.executeRound([searchCall(5)]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(activities.some((activity) => activity.id === "call-5" && activity.status === "completed"))
      .toBe(true);
  });

  it("returns structured errors when every provider key is exhausted", async () => {
    const activities: Array<{ provider: string; status: string }> = [];
    const executor = new WebToolExecutor(
      new BraveSearchClient([], vi.fn() as typeof fetch),
      new TavilyExtractClient([], vi.fn() as typeof fetch),
      new AbortController().signal,
      (activity) => activities.push(activity),
    );

    const results = await executor.executeRound([searchCall(1), readCall(1)]);

    expect(JSON.parse(results[0].content).error).toContain("Brave Search is unavailable");
    expect(JSON.parse(results[1].content).error).toContain("Tavily is unavailable");
    expect(activities).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "brave", status: "running" }),
      expect.objectContaining({ provider: "brave", status: "error" }),
      expect.objectContaining({ provider: "tavily", status: "running" }),
      expect.objectContaining({ provider: "tavily", status: "error" }),
    ]));
  });
});
