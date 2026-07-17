export interface SqlClient {
  unsafe<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    parameters?: readonly unknown[],
  ): Promise<T[]>;
  begin<T>(callback: (transaction: SqlClient) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
}

export interface MemoryJob {
  job_id: string;
  user_id: string;
  conversation_id: string | null;
  assistant_message_id: string | null;
  job_type: "exchange" | "summary" | "dream" | "redact";
  job_payload: Record<string, unknown>;
  queue_message_id: number;
  attempt: number;
}

export async function queryOne<T extends Record<string, unknown>>(
  sql: SqlClient,
  query: string,
  parameters: readonly unknown[] = [],
): Promise<T | null> {
  return (await sql.unsafe<T>(query, parameters))[0] ?? null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sanitizedErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : "memory_worker_error";
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 80) || "memory_worker_error";
}
