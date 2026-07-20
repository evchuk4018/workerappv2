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

export type AgentRunStatus =
  | "uploading"
  | "ready"
  | "streaming"
  | "awaiting_python"
  | "completed"
  | "stopped"
  | "error";

export type MessageStatus =
  | "streaming"
  | "awaiting_tool"
  | "completed"
  | "stopped"
  | "error";

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
          status: MessageStatus;
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
          status?: MessageStatus;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          reasoning_content?: string | null;
          reasoning_blocks?: ReasoningBlock[];
          tool_activity?: ToolActivity[];
          status?: MessageStatus;
          duration_ms?: number | null;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          user_message_id: string;
          assistant_message_id: string | null;
          status: AgentRunStatus;
          provider_state: Json;
          pending_tool_call: Json | null;
          pending_call_token: string | null;
          version: number;
          lease_token: string | null;
          lease_expires_at: string | null;
          tool_round_count: number;
          python_execution_count: number;
          error: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          user_message_id: string;
          assistant_message_id?: string | null;
          status?: AgentRunStatus;
          provider_state?: Json;
          pending_tool_call?: Json | null;
          pending_call_token?: string | null;
          version?: number;
          lease_token?: string | null;
          lease_expires_at?: string | null;
          tool_round_count?: number;
          python_execution_count?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          assistant_message_id?: string | null;
          status?: AgentRunStatus;
          provider_state?: Json;
          pending_tool_call?: Json | null;
          pending_call_token?: string | null;
          version?: number;
          lease_token?: string | null;
          lease_expires_at?: string | null;
          tool_round_count?: number;
          python_execution_count?: number;
          error?: string | null;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      chat_files: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          message_id: string | null;
          agent_run_id: string | null;
          call_token: string | null;
          call_index: number | null;
          kind: "input" | "artifact";
          bucket_id: "chat-files";
          object_path: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          message_id?: string | null;
          agent_run_id?: string | null;
          call_token?: string | null;
          call_index?: number | null;
          kind: "input" | "artifact";
          bucket_id?: "chat-files";
          object_path: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          created_at?: string;
        };
        Update: {
          message_id?: string | null;
          agent_run_id?: string | null;
          call_token?: string | null;
          call_index?: number | null;
          object_path?: string;
          original_name?: string;
          mime_type?: string;
          size_bytes?: number;
        };
        Relationships: [];
      };
    } & MemoryDatabaseTables;
    Views: Record<string, never>;
    Functions: {
      persist_agent_run_transition: {
        Args: {
          p_run_id: string;
          p_lease_token: string;
          p_version: number;
          p_run_status: "awaiting_python" | "completed" | "stopped" | "error";
          p_provider_state: Json;
          p_pending_tool_call: Json | null;
          p_pending_call_token: string | null;
          p_content: string;
          p_reasoning: string;
          p_reasoning_blocks: Json;
          p_tool_activity: Json;
          p_message_status: "awaiting_tool" | "completed" | "stopped" | "error";
          p_duration_ms: number;
          p_tool_round_count: number;
          p_python_execution_count: number;
          p_error?: string | null;
        };
        Returns: boolean;
      };
      stop_agent_run: {
        Args: {
          p_assistant_message_id: string;
          p_content: string;
          p_reasoning: string;
          p_reasoning_blocks: Json;
          p_tool_activity: Json;
          p_duration_ms: number | null;
        };
        Returns: "no_run" | "terminal" | "stopped";
      };
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
