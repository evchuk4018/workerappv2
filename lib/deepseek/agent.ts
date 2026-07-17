import type { ModelPreset } from "@/lib/models";
import { buildDeepSeekModelOptions } from "@/lib/models";
import { parseDeepSeekSseBlock } from "@/lib/streaming";
import type { ToolActivity } from "@/lib/tool-activity";
import { BraveSearchClient } from "@/lib/web/brave";
import type { Fetcher } from "@/lib/web/key-failover";
import { TavilyExtractClient } from "@/lib/web/tavily";
import { WEB_TOOLS, type AgentMessage, type AgentToolCall } from "@/lib/deepseek/tool-types";
import { WebToolExecutor } from "@/lib/deepseek/web-tools";

const MAX_TOOL_ROUNDS = 5;

interface AgentCallbacks {
  onReasoning: (delta: string, roundIndex: number) => void;
  onReasoningComplete: (roundIndex: number, durationMs: number) => void;
  onContent: (delta: string) => void;
  onActivity: (activity: ToolActivity) => void;
}

interface RunAgentOptions extends AgentCallbacks {
  apiKey: string;
  preset: ModelPreset;
  messages: AgentMessage[];
  braveKeys: readonly string[];
  tavilyKeys: readonly string[];
  signal: AbortSignal;
  fetcher?: Fetcher;
}

interface RoundResult {
  content: string;
  reasoning: string;
  toolCalls: AgentToolCall[];
}

function mergeToolFragments(
  fragments: Map<number, AgentToolCall>,
  deltas: Array<{ index: number; id: string; name: string; arguments: string }>,
) {
  for (const delta of deltas) {
    const current = fragments.get(delta.index) ?? {
      id: "",
      type: "function" as const,
      function: { name: "", arguments: "" },
    };
    current.id += delta.id;
    current.function.name += delta.name;
    current.function.arguments += delta.arguments;
    fragments.set(delta.index, current);
  }
}

async function streamRound(
  options: RunAgentOptions,
  messages: AgentMessage[],
  allowTools: boolean,
  roundIndex: number,
): Promise<RoundResult> {
  const response = await (options.fetcher ?? fetch)("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...buildDeepSeekModelOptions(options.preset),
      messages,
      ...(allowTools ? { tools: WEB_TOOLS } : {}),
      stream: true,
      max_tokens: 8192,
    }),
    signal: options.signal,
  });
  if (!response.ok || !response.body) throw new Error(`DeepSeek returned ${response.status}.`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const fragments = new Map<number, AgentToolCall>();
  let buffer = "";
  let content = "";
  let reasoning = "";

  const consume = (block: string) => {
    const delta = parseDeepSeekSseBlock(block);
    if (!delta) return false;
    if (delta.reasoning) {
      reasoning += delta.reasoning;
      options.onReasoning(delta.reasoning, roundIndex);
    }
    if (delta.content) {
      content += delta.content;
      options.onContent(delta.content);
    }
    mergeToolFragments(fragments, delta.toolCalls);
    return delta.done;
  };

  let finished = false;
  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      if (consume(block)) {
        finished = true;
        break;
      }
    }
  }
  if (buffer.trim()) consume(buffer);

  const toolCalls = [...fragments.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => call);
  if (toolCalls.some((call) => !call.id || !call.function.name)) {
    throw new Error("DeepSeek returned an incomplete tool call.");
  }
  return { content, reasoning, toolCalls };
}

export async function runDeepSeekAgent(options: RunAgentOptions) {
  const messages = [...options.messages];
  const brave = new BraveSearchClient(options.braveKeys, options.fetcher);
  const tavily = new TavilyExtractClient(options.tavilyKeys, options.fetcher);
  const executor = new WebToolExecutor(brave, tavily, options.signal, options.onActivity);
  let fullContent = "";
  let fullReasoning = "";
  let toolRounds = 0;

  while (true) {
    const roundStartedAt = Date.now();
    const round = await streamRound(
      options,
      messages,
      toolRounds < MAX_TOOL_ROUNDS,
      toolRounds,
    );
    fullContent += round.content;
    fullReasoning += round.reasoning;
    if (round.reasoning || round.toolCalls.length) {
      options.onReasoningComplete(toolRounds, Date.now() - roundStartedAt);
    }

    if (!round.toolCalls.length || toolRounds >= MAX_TOOL_ROUNDS) {
      return { content: fullContent, reasoning: fullReasoning };
    }

    messages.push({
      role: "assistant",
      content: round.content || null,
      reasoning_content: round.reasoning || null,
      tool_calls: round.toolCalls,
    });
    const results = await executor.executeRound(round.toolCalls, toolRounds);
    results.forEach((result, index) => {
      messages.push({
        role: "tool",
        tool_call_id: round.toolCalls[index].id,
        content: result.content,
      });
    });
    toolRounds += 1;
  }
}
