import type { AgentExecutionState } from "./agent";
import type { AgentMessage, AgentToolCall } from "./tool-types";

const MAX_MESSAGES = 80;
const MAX_MESSAGE_LENGTH = 100_000;

function text(value: unknown): string;
function text(value: unknown, nullable: true): string | null;
function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > MAX_MESSAGE_LENGTH) {
    throw new TypeError("Saved agent state contains invalid message content.");
  }
  return value;
}

function toolCall(value: unknown): AgentToolCall {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Saved agent state contains an invalid tool call.");
  }
  const call = value as Record<string, unknown>;
  const fn = call.function as Record<string, unknown> | undefined;
  const id = text(call.id);
  const name = text(fn?.name);
  const argumentsValue = text(fn?.arguments);
  if (!id || !name) throw new TypeError("Saved tool calls require an ID and name.");
  return { id, type: "function", function: { name, arguments: argumentsValue } };
}

function message(value: unknown): AgentMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Saved agent state contains an invalid message.");
  }
  const item = value as Record<string, unknown>;
  if (item.role === "system" || item.role === "user") {
    return { role: item.role, content: text(item.content) };
  }
  if (item.role === "tool") {
    return { role: "tool", content: text(item.content), tool_call_id: text(item.tool_call_id) };
  }
  if (item.role === "assistant") {
    const calls = item.tool_calls === undefined
      ? undefined
      : Array.isArray(item.tool_calls) ? item.tool_calls.map(toolCall) : null;
    if (calls === null) throw new TypeError("Saved assistant tool calls must be an array.");
    return {
      role: "assistant",
      content: text(item.content, true),
      reasoning_content: item.reasoning_content === undefined
        ? undefined
        : text(item.reasoning_content, true),
      ...(calls ? { tool_calls: calls } : {}),
    };
  }
  throw new TypeError("Saved agent state contains an unknown message role.");
}

function count(value: unknown, maximum: number, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`Saved ${label} is invalid.`);
  }
  return value;
}

export function parseAgentExecutionState(value: unknown): AgentExecutionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Saved agent state is invalid.");
  }
  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.messages) || state.messages.length > MAX_MESSAGES) {
    throw new TypeError("Saved agent messages are invalid.");
  }
  return {
    messages: state.messages.map(message),
    content: text(state.content),
    reasoning: text(state.reasoning),
    toolRounds: count(state.toolRounds, 5, "tool-round count"),
    pythonExecutions: count(state.pythonExecutions, 3, "Python execution count"),
  };
}
