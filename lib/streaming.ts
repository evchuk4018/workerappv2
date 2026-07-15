export type StreamEvent =
  | {
      type: "meta";
      conversationId: string;
      userMessageId: string;
      assistantMessageId: string;
      title: string;
    }
  | { type: "reasoning_delta"; delta: string }
  | { type: "content_delta"; delta: string }
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
    return { reasoning: "", content: "", done: true };
  }

  const parsed = JSON.parse(data) as {
    choices?: Array<{
      delta?: { reasoning_content?: string | null; content?: string | null };
    }>;
  };
  const delta = parsed.choices?.[0]?.delta;

  return {
    reasoning: delta?.reasoning_content ?? "",
    content: delta?.content ?? "",
    done: false,
  };
}
