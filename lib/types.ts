import type { ModelPreset } from "@/lib/models";
import type { ReasoningBlock } from "@/lib/reasoning-block";
import type { ToolActivity } from "@/lib/tool-activity";
import type { MemoryMode } from "@/lib/memory/types";

export type MessageStatus = "streaming" | "awaiting_tool" | "completed" | "stopped" | "error";

export interface ChatFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  download_url?: string;
  preview_url?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  memory_mode: MemoryMode;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  reasoning_content: string | null;
  reasoning_blocks: ReasoningBlock[];
  tool_activity: ToolActivity[];
  model_preset: ModelPreset | null;
  status: MessageStatus;
  duration_ms: number | null;
  created_at: string;
  attachments?: ChatFile[];
}
