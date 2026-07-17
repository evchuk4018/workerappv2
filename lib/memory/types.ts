export type MemoryMode = "normal" | "off";
export type MemoryWriteMode = "read_write" | "read_only";

export type MemoryType =
  | "instruction"
  | "preference"
  | "fact"
  | "goal"
  | "constraint"
  | "project"
  | "relationship"
  | "event"
  | "temporary";

export type MemoryState =
  | "active"
  | "pending_review"
  | "superseded"
  | "expired"
  | "deleted";

export type MemoryOrigin = "explicit" | "inferred" | "manual";

export interface MemorySettings {
  savedMemoryEnabled: boolean;
  previousConversationsEnabled: boolean;
  inferredMemoryEnabled: boolean;
  writeMode: MemoryWriteMode;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  savedMemoryEnabled: true,
  previousConversationsEnabled: true,
  inferredMemoryEnabled: true,
  writeMode: "read_write",
};

export interface MemoryRecord {
  id: string;
  canonical_content: string | null;
  memory_type: MemoryType;
  confidence: number;
  salience: number;
  usefulness: number;
  origin: MemoryOrigin;
  pinned: boolean;
  state: MemoryState;
  valid_from: string | null;
  valid_until: string | null;
  confirmed_at: string | null;
  last_used_at: string | null;
  use_count: number;
  supersedes_memory_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MemoryProfile {
  id: string;
  version: number;
  status: "candidate" | "active" | "rejected" | "rolled_back" | "invalidated";
  profile_text: string;
  profile_json: unknown[];
  token_estimate: number;
  based_on_profile_id: string | null;
  trigger_reason: string;
  rejection_reason: string | null;
  created_at: string;
  activated_at: string | null;
}

export interface MemoryReview {
  id: string;
  operation: string;
  proposed_content: string | null;
  memory_type: MemoryType | null;
  confidence: number | null;
  reason: string;
  state: "pending" | "accepted" | "rejected";
  related_memory_id: string | null;
  source_conversation_id: string | null;
  source_message_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface MemoryChange {
  id: string;
  memory_id: string | null;
  action: string;
  actor: "user" | "worker" | "system";
  metadata: Record<string, unknown>;
  created_at: string;
}

