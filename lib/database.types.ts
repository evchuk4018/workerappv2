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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
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
          model_preset?: "high" | "medium" | "low" | "flash" | null;
          status?: "streaming" | "completed" | "stopped" | "error";
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          reasoning_content?: string | null;
          status?: "streaming" | "completed" | "stopped" | "error";
          duration_ms?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
