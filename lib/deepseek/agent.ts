import type { ModelPreset } from "@/lib/models";
import { buildDeepSeekModelOptions } from "@/lib/models";
import { parseDeepSeekSseBlock } from "@/lib/streaming";
import type { ToolActivity } from "@/lib/tool-activity";
import { BraveSearchClient } from "@/lib/web/brave";
import type { Fetcher } from "@/lib/web/key-failover";
import { TavilyExtractClient } from "@/lib/web/tavily";
import { WEB_TOOLS, type AgentMessage, type AgentToolCall } from "@/lib/deepseek/tool-types";
import { WebToolExecutor } from "@/lib/deepseek/web-tools";
import {
  PYTHON_TOOL,
  parsePythonToolRequest,
  type PythonToolRequest,
} from "@/lib/deepseek/python-tool";

const MAX_TOOL_ROUNDS = 5;

interface AgentCallbacks {
  onReasoning: (delta: string, roundIndex: number) => void;
  onReasoningComplete: (roundIndex: number, durationMs: number) => void;
  onContent: (delta: string) => void;
  onActivity: (activity: ToolActivity) => void;
}

export interface RunAgentOptions extends AgentCallbacks {
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

export interface AgentExecutionState {
  messages: AgentMessage[];
  content: string;
  reasoning: string;
  toolRounds: number;
  pythonExecutions: number;
}

export type AgentExecutionOutcome =
  | { status: "completed"; state: AgentExecutionState }
  | { status: "awaiting_python"; state: AgentExecutionState; request: PythonToolRequest };

const ALL_TOOLS = [...WEB_TOOLS, PYTHON_TOOL];

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
      ...(allowTools ? { tools: ALL_TOOLS } : {}),
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

function initialState(messages: AgentMessage[]): AgentExecutionState {
  return { messages: [...messages], content: "", reasoning: "", toolRounds: 0, pythonExecutions: 0 };
}

function assistantToolMessage(round: RoundResult): AgentMessage {
  return {
    role: "assistant",
    content: round.content || null,
    reasoning_content: round.reasoning || null,
    tool_calls: round.toolCalls,
  };
}

function toolError(call: AgentToolCall, message: string): AgentMessage {
  return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: message }) };
}

export function resumeAgentState(
  state: AgentExecutionState,
  callId: string,
  toolContent: string,
): AgentExecutionState {
  const last = state.messages.at(-1);
  if (last?.role !== "assistant" || !last.tool_calls?.some((call) => call.id === callId)) {
    throw new TypeError("The Python result does not match the pending tool call.");
  }
  return {
    ...state,
    messages: [...state.messages, { role: "tool", tool_call_id: callId, content: toolContent }],
  };
}

export async function runDeepSeekAgentUntilPause(
  options: RunAgentOptions,
  suppliedState?: AgentExecutionState,
): Promise<AgentExecutionOutcome> {
  const state = suppliedState
    ? { ...suppliedState, messages: [...suppliedState.messages] }
    : initialState(options.messages);
  const brave = new BraveSearchClient(options.braveKeys, options.fetcher);
  const tavily = new TavilyExtractClient(options.tavilyKeys, options.fetcher);
  const executor = new WebToolExecutor(brave, tavily, options.signal, options.onActivity);

  while (true) {
    const roundStartedAt = Date.now();
    const round = await streamRound(
      options,
      state.messages,
      state.toolRounds < MAX_TOOL_ROUNDS,
      state.toolRounds,
    );
    state.content += round.content;
    state.reasoning += round.reasoning;
    if (round.reasoning || round.toolCalls.length) {
      options.onReasoningComplete(state.toolRounds, Date.now() - roundStartedAt);
    }

    if (!round.toolCalls.length || state.toolRounds >= MAX_TOOL_ROUNDS) {
      return { status: "completed", state };
    }

    state.messages.push(assistantToolMessage(round));
    const pythonCalls = round.toolCalls.filter((call) => call.function.name === "run_python");
    if (pythonCalls.length) {
      state.toolRounds += 1;
      if (pythonCalls.length !== 1 || round.toolCalls.length !== 1) {
        round.toolCalls.forEach((call) => state.messages.push(toolError(
          call,
          "Call run_python by itself, one execution at a time.",
        )));
        continue;
      }
      if (state.pythonExecutions >= 3) {
        state.messages.push(toolError(pythonCalls[0], "This reply reached its limit of 3 Python executions."));
        continue;
      }
      try {
        const request = parsePythonToolRequest(
          pythonCalls[0].id,
          pythonCalls[0].function.arguments,
        );
        state.pythonExecutions += 1;
        return { status: "awaiting_python", state, request };
      } catch (caught) {
        state.messages.push(toolError(
          pythonCalls[0],
          caught instanceof Error ? caught.message : "Invalid Python request.",
        ));
        continue;
      }
    }

    const results = await executor.executeRound(round.toolCalls, state.toolRounds);
    results.forEach((result, index) => {
      state.messages.push({
        role: "tool",
        tool_call_id: round.toolCalls[index].id,
        content: result.content,
      });
    });
    state.toolRounds += 1;
  }
}

export async function runDeepSeekAgent(options: RunAgentOptions) {
  let state: AgentExecutionState | undefined;
  while (true) {
    const outcome = await runDeepSeekAgentUntilPause(options, state);
    if (outcome.status === "completed") {
      return { content: outcome.state.content, reasoning: outcome.state.reasoning };
    }
    state = resumeAgentState(
      outcome.state,
      outcome.request.callId,
      JSON.stringify({ error: "Python execution is unavailable in this request context." }),
    );
  }
}
