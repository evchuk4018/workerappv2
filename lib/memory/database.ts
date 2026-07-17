import type { Json } from "@/lib/database.types";
import type { MemoryMode, MemoryOrigin, MemoryState, MemoryType } from "./types";

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type UserMemoryRow = {
  id: string; user_id: string; canonical_content: string | null; memory_type: MemoryType;
  dedup_key_hash: string; confidence: number; salience: number; usefulness: number;
  origin: MemoryOrigin; pinned: boolean; state: MemoryState; valid_from: string | null;
  valid_until: string | null; confirmed_at: string | null; last_used_at: string | null;
  use_count: number; supersedes_memory_id: string | null; created_at: string;
  updated_at: string; deleted_at: string | null; search_vector: string;
}

export type MemoryDatabaseTables = {
  user_memories: Table<UserMemoryRow, Partial<UserMemoryRow> & Pick<UserMemoryRow, "user_id" | "memory_type" | "dedup_key_hash" | "origin">>;
  memory_sources: Table<{
    id: string; memory_id: string; user_id: string; conversation_id: string;
    message_id: string; source_kind: "created" | "confirmed" | "corrected" | "forgotten"; created_at: string;
  }>;
  conversation_summaries: Table<{
    id: string; user_id: string; conversation_id: string; version: number;
    status: "active" | "superseded" | "invalidated"; summary_text: string;
    structured_content: Json; through_message_id: string | null; input_hash: string;
    created_at: string; invalidated_at: string | null; search_vector: string;
  }>;
  memory_profiles: Table<{
    id: string; user_id: string; version: number;
    status: "candidate" | "active" | "rejected" | "rolled_back" | "invalidated";
    profile_text: string; profile_json: Json; token_estimate: number;
    based_on_profile_id: string | null; trigger_reason: string; rejection_reason: string | null;
    created_at: string; activated_at: string | null;
  }>;
  memory_profile_sources: Table<{
    profile_id: string; memory_id: string; user_id: string; claim_index: number; summary_id: string | null;
  }>;
  memory_events: Table<{
    id: string; user_id: string; memory_id: string | null; action: string;
    actor: "user" | "worker" | "system"; metadata: Json; created_at: string;
  }>;
  memory_reviews: Table<{
    id: string; user_id: string; operation: string; proposed_content: string | null;
    memory_type: MemoryType | null; confidence: number | null; reason: string;
    state: "pending" | "accepted" | "rejected"; related_memory_id: string | null;
    source_conversation_id: string | null; source_message_id: string | null;
    created_at: string; reviewed_at: string | null;
  }>;
  conversation_memory_state: Table<{
    conversation_id: string; user_id: string; processing_started_at: string;
    last_extracted_message_id: string | null; last_summarized_message_id: string | null;
    unprocessed_user_turns: number; memory_changes_since_dream: number;
    summary_changes_since_dream: number; last_dream_at: string | null; updated_at: string;
  }>;
  memory_commands: Table<{
    id: string; user_id: string; command: "refresh_profile" | "rollback_profile";
    payload: Json; status: "pending" | "processing" | "completed" | "failed";
    created_at: string; completed_at: string | null;
  }>;
};

export type RetrievedMemoryRow = {
  id: string; canonical_content: string; memory_type: MemoryType; confidence: number;
  salience: number; usefulness: number; origin: MemoryOrigin; pinned: boolean;
  valid_from: string | null; valid_until: string | null; score: number;
}

export type RetrievedSummaryRow = {
  id: string; conversation_id: string; summary_text: string;
  structured_content: Json; created_at: string; score: number;
}

export type MemoryModeColumn = MemoryMode;
