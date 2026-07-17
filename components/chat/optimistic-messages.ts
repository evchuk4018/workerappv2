import type { ModelPreset } from "@/lib/models";
import type { ChatMessage } from "@/lib/types";

export function buildOptimisticMessages(options: {
  conversationId: string | null;
  message: string;
  preset: ModelPreset;
  userId: string;
  assistantId: string;
  timestamp: string;
}): ChatMessage[] {
  const conversationId = options.conversationId ?? "pending";
  return [
    {
      id: options.userId,
      conversation_id: conversationId,
      role: "user",
      content: options.message,
      reasoning_content: null,
      reasoning_blocks: [],
      tool_activity: [],
      model_preset: null,
      status: "completed",
      duration_ms: null,
      created_at: options.timestamp,
    },
    {
      id: options.assistantId,
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      reasoning_content: "",
      reasoning_blocks: [],
      tool_activity: [],
      model_preset: options.preset,
      status: "streaming",
      duration_ms: null,
      created_at: options.timestamp,
    },
  ];
}
