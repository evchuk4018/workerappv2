export const MEMORY_TYPES = [
  "instruction", "preference", "fact", "goal", "constraint",
  "project", "relationship", "event", "temporary",
] as const;
export type MemoryType = typeof MEMORY_TYPES[number];
export type MemoryOperationName = "create" | "confirm" | "supersede" | "expire" | "delete" | "none";

export interface MemoryOperation {
  op: MemoryOperationName;
  memory_type?: MemoryType;
  stable_key?: string;
  content?: string;
  confidence?: number;
  salience?: number;
  target_memory_id?: string;
  valid_until?: string | null;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalScore(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? Math.round(value * 1000) / 1000
    : undefined;
}

export function parseExtractionOperations(value: unknown): MemoryOperation[] {
  if (!isRecord(value) || !Array.isArray(value.operations)) throw new Error("invalid_operations_shape");
  if (value.operations.length > 10) throw new Error("too_many_operations");
  return value.operations.map((raw): MemoryOperation => {
    if (!isRecord(raw) || !["create", "confirm", "supersede", "expire", "delete", "none"].includes(String(raw.op))) {
      throw new Error("invalid_operation");
    }
    const op = raw.op as MemoryOperationName;
    const memoryType = MEMORY_TYPES.includes(raw.memory_type as MemoryType)
      ? raw.memory_type as MemoryType
      : undefined;
    const content = typeof raw.content === "string" ? raw.content.trim().replace(/\s+/g, " ") : undefined;
    const stableKey = typeof raw.stable_key === "string" ? raw.stable_key.trim().slice(0, 500) : undefined;
    const targetId = typeof raw.target_memory_id === "string" ? raw.target_memory_id : undefined;
    if ((op === "create" || op === "supersede") && (!memoryType || !content || content.length > 2000 || !stableKey)) {
      throw new Error("invalid_create_operation");
    }
    if (["confirm", "expire", "delete"].includes(op) && !targetId) throw new Error("missing_target");
    return {
      op,
      memory_type: memoryType,
      stable_key: stableKey,
      content,
      confidence: optionalScore(raw.confidence),
      salience: optionalScore(raw.salience),
      target_memory_id: targetId,
      valid_until: typeof raw.valid_until === "string" ? raw.valid_until : null,
      reason: typeof raw.reason === "string" ? raw.reason.slice(0, 300) : undefined,
    };
  });
}

export interface ProfileClaim { text: string; memory_ids: string[]; uncertainty?: string }

export function parseProfileClaims(value: unknown): ProfileClaim[] {
  if (!isRecord(value) || !Array.isArray(value.claims) || value.claims.length > 30) {
    throw new Error("invalid_profile_shape");
  }
  return value.claims.map((raw) => {
    if (!isRecord(raw) || typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 500) {
      throw new Error("invalid_profile_claim");
    }
    if (!Array.isArray(raw.memory_ids) || !raw.memory_ids.length || raw.memory_ids.some((id) => typeof id !== "string")) {
      throw new Error("profile_claim_without_atomic_source");
    }
    return {
      text: raw.text.trim(),
      memory_ids: [...new Set(raw.memory_ids as string[])],
      ...(typeof raw.uncertainty === "string" && raw.uncertainty.trim()
        ? { uncertainty: raw.uncertainty.trim().slice(0, 200) }
        : {}),
    };
  });
}

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 3);
}

export function targetedOperationDecision(options: {
  operation: "confirm" | "supersede" | "expire" | "delete";
  explicit: boolean;
  forgetCue: boolean;
  targetPinned: boolean;
  targetOrigin: string;
}): "apply" | "review" | "ignore" {
  if (options.operation === "delete") return options.forgetCue ? "apply" : "ignore";
  if (options.operation === "supersede" && !options.explicit &&
    (options.targetPinned || options.targetOrigin === "explicit")) return "review";
  if (options.operation === "expire" && options.targetPinned && !options.explicit) return "ignore";
  return "apply";
}

export function validateProfileCandidate(
  claims: ProfileClaim[],
  activeMemoryIds: ReadonlySet<string>,
  requiredPinnedIds: ReadonlySet<string>,
) {
  if (claims.some((claim) => claim.memory_ids.some((id) => !activeMemoryIds.has(id)))) {
    throw new Error("profile_has_unsupported_claim");
  }
  const claimedIds = new Set(claims.flatMap((claim) => claim.memory_ids));
  if ([...requiredPinnedIds].some((id) => !claimedIds.has(id))) {
    throw new Error("profile_removed_pinned_claim");
  }
  const profileText = claims
    .map((claim) => `- ${claim.text}${claim.uncertainty ? ` (${claim.uncertainty})` : ""}`)
    .join("\n");
  const tokenEstimate = estimateTokens(profileText);
  if (tokenEstimate > 600) throw new Error("profile_token_budget_exceeded");
  return { profileText, tokenEstimate };
}

export interface SummaryOutput {
  summary_text: string;
  main_topics: string[];
  decisions: string[];
  current_state: string[];
  open_tasks: string[];
  entities: string[];
  dates: string[];
  progress: string[];
}

export function parseSummary(value: unknown): SummaryOutput {
  if (!isRecord(value) || typeof value.summary_text !== "string") throw new Error("invalid_summary_shape");
  const summaryText = value.summary_text.trim();
  if (!summaryText || summaryText.length > 12000) throw new Error("invalid_summary_text");
  const array = (key: string) => {
    const item = value[key];
    if (!Array.isArray(item) || item.length > 30 || item.some((entry) => typeof entry !== "string")) {
      throw new Error(`invalid_summary_${key}`);
    }
    return (item as string[]).map((entry) => entry.trim()).filter(Boolean);
  };
  return {
    summary_text: summaryText,
    main_topics: array("main_topics"),
    decisions: array("decisions"),
    current_state: array("current_state"),
    open_tasks: array("open_tasks"),
    entities: array("entities"),
    dates: array("dates"),
    progress: array("progress"),
  };
}
