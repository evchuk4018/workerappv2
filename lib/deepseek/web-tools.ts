import type { ToolActivity } from "@/lib/tool-activity";
import { BraveSearchClient } from "@/lib/web/brave";
import { ProviderRequestError } from "@/lib/web/key-failover";
import { TavilyExtractClient } from "@/lib/web/tavily";
import type { AgentToolCall } from "@/lib/deepseek/tool-types";

const SEARCHES_PER_ROUND = 3;
const READS_PER_ROUND = 5;
const TOOL_CONCURRENCY = 3;

interface ToolExecution {
  content: string;
  activity?: ToolActivity;
}

interface ToolTask {
  call: AgentToolCall;
  allowed: boolean;
  roundIndex: number;
  callIndex: number;
}

function safeArguments(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Tool arguments must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new TypeError("DeepSeek produced invalid tool arguments.");
  }
}

function safeError(caught: unknown, provider: "brave" | "tavily") {
  if (caught instanceof TypeError) return caught.message;
  if (caught instanceof ProviderRequestError && !caught.retryable) return caught.message;
  return provider === "brave"
    ? "Brave Search is unavailable after trying every configured key."
    : "Tavily is unavailable after trying every configured key.";
}

async function mapConcurrent<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

export class WebToolExecutor {
  constructor(
    private readonly brave: BraveSearchClient,
    private readonly tavily: TavilyExtractClient,
    private readonly signal: AbortSignal,
    private readonly onActivity: (activity: ToolActivity) => void,
  ) {}

  async executeRound(calls: readonly AgentToolCall[], roundIndex = 0) {
    let searches = 0;
    let reads = 0;
    const tasks: ToolTask[] = calls.map((call, callIndex) => {
      if (call.function.name === "web_search") {
        searches += 1;
        return { call, allowed: searches <= SEARCHES_PER_ROUND, roundIndex, callIndex };
      }
      if (call.function.name === "read_webpage") {
        reads += 1;
        return { call, allowed: reads <= READS_PER_ROUND, roundIndex, callIndex };
      }
      return { call, allowed: true, roundIndex, callIndex };
    });
    return mapConcurrent(tasks, TOOL_CONCURRENCY, (task) => this.execute(task));
  }

  private async execute({ call, allowed, roundIndex, callIndex }: ToolTask): Promise<ToolExecution> {
    const isSearch = call.function.name === "web_search";
    const isRead = call.function.name === "read_webpage";
    if (!isSearch && !isRead) {
      return { content: JSON.stringify({ error: `Unknown tool: ${call.function.name}` }) };
    }

    const provider = isSearch ? "brave" as const : "tavily" as const;
    const kind = isSearch ? "search" as const : "read" as const;
    const startedAt = new Date().toISOString();
    let args: Record<string, unknown> = {};
    try {
      args = safeArguments(call.function.arguments);
    } catch (caught) {
      const error = safeError(caught, provider);
      const activity: ToolActivity = {
        id: call.id, kind, provider, status: "error", round_index: roundIndex,
        call_index: callIndex, sources: [], error,
        started_at: startedAt, completed_at: new Date().toISOString(),
      };
      this.onActivity(activity);
      return { content: JSON.stringify({ error }), activity };
    }

    const running: ToolActivity = {
      id: call.id,
      kind,
      provider,
      status: "running",
      round_index: roundIndex,
      call_index: callIndex,
      ...(isSearch && typeof args.query === "string" ? { query: args.query.slice(0, 400) } : {}),
      ...(isRead && typeof args.url === "string" ? { url: args.url.slice(0, 2_048) } : {}),
      sources: [],
      started_at: startedAt,
    };
    this.onActivity(running);

    if (!allowed) {
      const error = isSearch
        ? "This reasoning round exceeded its allowance of 3 searches."
        : "This reasoning round exceeded its allowance of 5 page reads.";
      const activity = { ...running, status: "error" as const, error, completed_at: new Date().toISOString() };
      this.onActivity(activity);
      return { content: JSON.stringify({ error }), activity };
    }

    try {
      if (isSearch) {
        const query = typeof args.query === "string" ? args.query : "";
        const result = await this.brave.search(query, this.signal);
        const activity: ToolActivity = {
          ...running, status: "completed", sources: result.sources,
          completed_at: new Date().toISOString(),
        };
        this.onActivity(activity);
        return { content: result.content, activity };
      }

      const result = await this.tavily.read(args.url, args.focus, this.signal);
      const activity: ToolActivity = {
        ...running,
        status: "completed",
        url: result.url,
        extraction_mode: result.mode,
        sources: [{ title: result.title, url: result.url, snippet: "" }],
        completed_at: new Date().toISOString(),
      };
      this.onActivity(activity);
      return {
        content: JSON.stringify({ url: result.url, extraction_mode: result.mode, markdown: result.content }),
        activity,
      };
    } catch (caught) {
      if (this.signal.aborted) throw caught;
      const error = safeError(caught, provider);
      const activity: ToolActivity = {
        ...running, status: "error", error, completed_at: new Date().toISOString(),
      };
      this.onActivity(activity);
      return { content: JSON.stringify({ error }), activity };
    }
  }
}
