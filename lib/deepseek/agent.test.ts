import { describe, expect, it, vi } from "vitest";
import { resumeAgentState, runDeepSeekAgent, runDeepSeekAgentUntilPause } from "./agent";

function sse(chunks: unknown[]) {
  const body = [
    ...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`),
    "data: [DONE]",
    "",
  ].join("\n\n");
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

function toolRound(id: string, reasoning = "I should search.") {
  return sse([
    { choices: [{ delta: { reasoning_content: reasoning }, finish_reason: null }] },
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id,
            function: { name: "web_search", arguments: '{"query":"current answer"}' },
          }],
        },
        finish_reason: "tool_calls",
      }],
    },
  ]);
}

describe("DeepSeek web agent", () => {
  it("pauses for browser Python and resumes the same tool transcript", async () => {
    let calls = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return sse([{
        choices: [{
          delta: { tool_calls: [{
            index: 0, id: "python-1",
            function: {
              name: "run_python",
              arguments: JSON.stringify({ code: "print(6 * 7)", packages: [], input_file_ids: [] }),
            },
          }] },
          finish_reason: "tool_calls",
        }],
      }]);
      const body = JSON.parse(String(init?.body));
      expect(body.messages.at(-1)).toEqual({
        role: "tool", tool_call_id: "python-1", content: '{"stdout":"42"}',
      });
      return sse([{ choices: [{ delta: { content: "The verified result is 42." }, finish_reason: "stop" }] }]);
    });
    const options = {
      apiKey: "deepseek", preset: "medium" as const,
      messages: [{ role: "user" as const, content: "Verify 6 * 7" }],
      braveKeys: [], tavilyKeys: [], signal: new AbortController().signal,
      fetcher: fetcher as typeof fetch, onReasoning: () => undefined,
      onReasoningComplete: () => undefined, onContent: () => undefined,
      onActivity: () => undefined,
    };
    const paused = await runDeepSeekAgentUntilPause(options);
    expect(paused.status).toBe("awaiting_python");
    if (paused.status !== "awaiting_python") return;
    const resumed = resumeAgentState(paused.state, paused.request.callId, '{"stdout":"42"}');
    const completed = await runDeepSeekAgentUntilPause(options, resumed);
    expect(completed.status).toBe("completed");
    expect(completed.state.content).toBe("The verified result is 42.");
  });

  it("replays tool calls with reasoning content before streaming the grounded answer", async () => {
    let deepSeekCalls = 0;
    const activities: string[] = [];
    const completedRounds: number[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("deepseek.com")) {
        deepSeekCalls += 1;
        if (deepSeekCalls === 1) return toolRound("call-search");
        const body = JSON.parse(String(init?.body));
        expect(body.messages).toEqual(expect.arrayContaining([
          expect.objectContaining({
            role: "assistant",
            reasoning_content: "I should search.",
            tool_calls: [expect.objectContaining({ id: "call-search" })],
          }),
          expect.objectContaining({ role: "tool", tool_call_id: "call-search" }),
        ]));
        return sse([{ choices: [{ delta: { content: "Grounded answer" }, finish_reason: "stop" }] }]);
      }
      return Response.json({
        grounding: { generic: [{ title: "Source", url: "https://example.com", snippets: ["Fact"] }] },
      });
    });

    const result = await runDeepSeekAgent({
      apiKey: "deepseek",
      preset: "medium",
      messages: [{ role: "user", content: "What is current?" }],
      braveKeys: ["brave"],
      tavilyKeys: [],
      signal: new AbortController().signal,
      fetcher: fetcher as typeof fetch,
      onReasoning: () => undefined,
      onReasoningComplete: (roundIndex) => completedRounds.push(roundIndex),
      onContent: () => undefined,
      onActivity: (activity) => activities.push(activity.status),
    });

    expect(result).toEqual({ content: "Grounded answer", reasoning: "I should search." });
    expect(activities).toEqual(["running", "completed"]);
    expect(completedRounds).toEqual([0]);
  });

  it("forces a final answer after five tool rounds", async () => {
    let deepSeekCalls = 0;
    const completedRounds: number[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("deepseek.com")) {
        deepSeekCalls += 1;
        const body = JSON.parse(String(init?.body));
        if (deepSeekCalls <= 5) {
          expect(body.tools).toBeDefined();
          return toolRound(`call-${deepSeekCalls}`, `round-${deepSeekCalls}`);
        }
        expect(body.tools).toBeUndefined();
        return sse([{ choices: [{ delta: { content: "Final answer" }, finish_reason: "stop" }] }]);
      }
      return Response.json({ grounding: { generic: [] } });
    });

    const result = await runDeepSeekAgent({
      apiKey: "deepseek",
      preset: "flash",
      messages: [{ role: "user", content: "Research this" }],
      braveKeys: ["brave"],
      tavilyKeys: [],
      signal: new AbortController().signal,
      fetcher: fetcher as typeof fetch,
      onReasoning: () => undefined,
      onReasoningComplete: (roundIndex) => completedRounds.push(roundIndex),
      onContent: () => undefined,
      onActivity: () => undefined,
    });

    expect(deepSeekCalls).toBe(6);
    expect(result.content).toBe("Final answer");
    expect(result.reasoning).toBe("round-1round-2round-3round-4round-5");
    expect(completedRounds).toEqual([0, 1, 2, 3, 4]);
  });

  it("propagates cancellation to the active DeepSeek request", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      })
    ));

    const pending = runDeepSeekAgent({
      apiKey: "deepseek",
      preset: "medium",
      messages: [{ role: "user", content: "Stop this" }],
      braveKeys: [],
      tavilyKeys: [],
      signal: controller.signal,
      fetcher: fetcher as typeof fetch,
      onReasoning: () => undefined,
      onReasoningComplete: () => undefined,
      onContent: () => undefined,
      onActivity: () => undefined,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
