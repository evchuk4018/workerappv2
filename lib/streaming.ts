import type { ToolActivity } from "@/lib/tool-activity";
import type { PythonToolRequest } from "@/lib/deepseek/python-tool";

export interface PythonStreamInput {
  fileId: string;
  objectPath: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export type StreamEvent =
  | {
      type: "meta";
      conversationId: string;
      userMessageId: string;
      assistantMessageId: string;
      title: string;
    }
  | { type: "reasoning_delta"; roundIndex: number; delta: string }
  | { type: "reasoning_round_complete"; roundIndex: number; durationMs: number }
  | { type: "content_delta"; delta: string }
  | { type: "tool_activity"; activity: ToolActivity }
  | {
      type: "python_request";
      runId: string;
      callToken: string;
      request: PythonToolRequest;
      inputs: PythonStreamInput[];
    }
  | { type: "title"; conversationId: string; title: string }
  | { type: "done"; durationMs: number; status: "completed" | "stopped" }
  | { type: "error"; message: string };

export function encodeStreamEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function parseNdjsonBuffer(buffer: string) {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  const events: StreamEvent[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    events.push(JSON.parse(line) as StreamEvent);
  }

  return { events, remainder };
}

export interface DeepSeekDelta {
  reasoning: string;
  content: string;
  toolCalls: Array<{
    index: number;
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason: string | null;
  done: boolean;
}

export function parseDeepSeekSseBlock(block: string): DeepSeekDelta | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) return null;
  if (data.trim() === "[DONE]") {
    return { reasoning: "", content: "", toolCalls: [], finishReason: null, done: true };
  }

  const parsed = JSON.parse(data) as {
    choices?: Array<{
      delta?: {
        reasoning_content?: string | null;
        content?: string | null;
        tool_calls?: Array<{
          index?: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
      finish_reason?: string | null;
    }>;
  };
  const choice = parsed.choices?.[0];
  const delta = choice?.delta;

  return {
    reasoning: delta?.reasoning_content ?? "",
    content: delta?.content ?? "",
    toolCalls: (delta?.tool_calls ?? []).map((call) => ({
      index: call.index ?? 0,
      id: call.id ?? "",
      name: call.function?.name ?? "",
      arguments: call.function?.arguments ?? "",
    })),
    finishReason: choice?.finish_reason ?? null,
    done: false,
  };
}
