import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { memoryDedupHash, normalizeMemoryContent } from "./identity";
import type { MemoryType } from "./types";

const MEMORY_TYPES = new Set<MemoryType>([
  "instruction", "preference", "fact", "goal", "constraint",
  "project", "relationship", "event", "temporary",
]);

export function parseMemoryType(value: unknown): MemoryType {
  if (typeof value !== "string" || !MEMORY_TYPES.has(value as MemoryType)) {
    throw new TypeError("Invalid memory type.");
  }
  return value as MemoryType;
}

export function parseOptionalScore(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("Scores must be between 0 and 1.");
  }
  return Math.round(value * 1000) / 1000;
}

export async function createManualMemory(options: {
  supabase: SupabaseClient<Database>;
  userId: string;
  content: string;
  memoryType: MemoryType;
  pinned?: boolean;
  salience?: number;
  validUntil?: string | null;
  actor?: "user" | "worker";
}) {
  const content = normalizeMemoryContent(options.content);
  const dedupKeyHash = memoryDedupHash(options.memoryType, content);
  const { data: existing } = await options.supabase.from("user_memories")
    .select("id").eq("user_id", options.userId).eq("dedup_key_hash", dedupKeyHash)
    .in("state", ["active", "pending_review"]).maybeSingle();

  if (existing) {
    const { data, error } = await options.supabase.from("user_memories").update({
      state: "active",
      confidence: 1,
      origin: "manual",
      confirmed_at: new Date().toISOString(),
      pinned: options.pinned ?? false,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id).select().single();
    if (error) throw error;
    await options.supabase.from("memory_events").insert({
      user_id: options.userId,
      memory_id: existing.id,
      action: "confirmed",
      actor: options.actor ?? "user",
      metadata: {},
    });
    return data;
  }

  const now = new Date().toISOString();
  const { data, error } = await options.supabase.from("user_memories").insert({
    user_id: options.userId,
    canonical_content: content,
    memory_type: options.memoryType,
    dedup_key_hash: dedupKeyHash,
    confidence: 1,
    salience: options.salience ?? 0.7,
    usefulness: 0.5,
    origin: "manual",
    pinned: options.pinned ?? false,
    state: "active",
    valid_until: options.validUntil ?? null,
    confirmed_at: now,
    updated_at: now,
  }).select().single();
  if (error || !data) throw error ?? new Error("Memory was not created.");
  await options.supabase.from("memory_events").insert({
    user_id: options.userId,
    memory_id: data.id,
    action: "created",
    actor: options.actor ?? "user",
    metadata: { origin: "manual" },
  });
  return data;
}

export async function editMemory(options: {
  supabase: SupabaseClient<Database>;
  userId: string;
  memoryId: string;
  content: string;
  memoryType: MemoryType;
  salience: number;
  validUntil: string | null;
}) {
  const { data: current } = await options.supabase.from("user_memories").select("*")
    .eq("id", options.memoryId).eq("user_id", options.userId).maybeSingle();
  if (!current || current.state === "deleted") throw new Error("Memory not found.");

  const content = normalizeMemoryContent(options.content);
  const dedupKeyHash = memoryDedupHash(options.memoryType, content);
  const { data: replacement, error } = await options.supabase.rpc("replace_memory", {
    target_memory_id: current.id,
    replacement_content: content,
    replacement_type: options.memoryType,
    replacement_hash: dedupKeyHash,
    replacement_salience: options.salience,
    replacement_valid_until: options.validUntil,
  });
  if (error || !replacement) throw error ?? new Error("Memory was not updated.");
  return replacement;
}
