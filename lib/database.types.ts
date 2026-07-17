import type { ToolActivity } from "@/lib/tool-activity";
import type { ReasoningBlock } from "@/lib/reasoning-block";
import type {
  MemoryDatabaseTables,
  RetrievedMemoryRow,
  RetrievedSummaryRow,
} from "@/lib/memory/database";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          title_finalized_at: string | null;
          system_prompt: string;
          memory_mode: "normal" | "off";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          title_finalized_at?: string | null;
          system_prompt?: string;
          memory_mode?: "normal" | "off";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          title_finalized_at?: string | null;
          memory_mode?: "normal" | "off";
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          system_prompt: string;
          saved_memory_enabled: boolean;
          previous_conversations_enabled: boolean;
          inferred_memory_enabled: boolean;
          memory_write_mode: "read_write" | "read_only";
          memory_started_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          system_prompt?: string;
          saved_memory_enabled?: boolean;
          previous_conversations_enabled?: boolean;
          inferred_memory_enabled?: boolean;
          memory_write_mode?: "read_write" | "read_only";
          memory_started_at?: string;
          updated_at?: string;
        };
        Update: {
          system_prompt?: string;
          saved_memory_enabled?: boolean;
          previous_conversations_enabled?: boolean;
          inferred_memory_enabled?: boolean;
          memory_write_mode?: "read_write" | "read_only";
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
          reasoning_content: string | null;
          reasoning_blocks: ReasoningBlock[];
          tool_activity: ToolActivity[];
          model_preset: "high" | "medium" | "low" | "flash" | null;
          status: "streaming" | "completed" | "stopped" | "error";
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant";
          content?: string;
          reasoning_content?: string | null;
          reasoning_blocks?: ReasoningBlock[];
          tool_activity?: ToolActivity[];
          model_preset?: "high" | "medium" | "low" | "flash" | null;
          status?: "streaming" | "completed" | "stopped" | "error";
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          reasoning_content?: string | null;
          reasoning_blocks?: ReasoningBlock[];
          tool_activity?: ToolActivity[];
          status?: "streaming" | "completed" | "stopped" | "error";
          duration_ms?: number | null;
        };
        Relationships: [];
      };
    } & MemoryDatabaseTables;
    Views: Record<string, never>;
    Functions: {
      retrieve_memories: {
        Args: { search_query: string; result_limit?: number };
        Returns: RetrievedMemoryRow[];
      };
      retrieve_conversation_summaries: {
        Args: { search_query: string; excluded_conversation_id?: string | null; result_limit?: number };
        Returns: RetrievedSummaryRow[];
      };
      record_memory_usage: { Args: { memory_ids: string[] }; Returns: undefined };
      replace_memory: {
        Args: {
          target_memory_id: string;
          replacement_content: string;
          replacement_type: string;
          replacement_hash: string;
          replacement_salience: number;
          replacement_valid_until?: string | null;
        };
        Returns: import("@/lib/memory/database").UserMemoryRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
