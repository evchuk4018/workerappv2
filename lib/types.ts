import type { ModelPreset } from "@/lib/models";
import type { ToolActivity } from "@/lib/tool-activity";

export type MessageStatus = "streaming" | "completed" | "stopped" | "error";

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  reasoning_content: string | null;
  tool_activity: ToolActivity[];
  model_preset: ModelPreset | null;
  status: MessageStatus;
  duration_ms: number | null;
  created_at: string;
}
