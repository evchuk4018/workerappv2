import { createHash } from "node:crypto";
import type { MemoryType } from "./types";

export function normalizeMemoryContent(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 2000) {
    throw new RangeError("Memory content must be between 1 and 2,000 characters.");
  }
  return normalized;
}

export function memoryDedupHash(type: MemoryType, stableKey: string): string {
  const normalized = stableKey.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 500) throw new RangeError("Invalid memory key.");
  return createHash("sha256").update(`${type}:${normalized}`).digest("hex");
}

