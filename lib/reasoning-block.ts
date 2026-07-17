export interface ReasoningBlock {
  round_index: number;
  content: string;
  duration_ms: number | null;
}

const MAX_BLOCKS = 20;
const MAX_CONTENT_LENGTH = 100_000;

function validRoundIndex(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function appendReasoningDelta(
  blocks: ReasoningBlock[],
  roundIndex: number,
  delta: string,
) {
  const existing = blocks.find((block) => block.round_index === roundIndex);
  if (!existing) {
    return [...blocks, {
      round_index: roundIndex,
      content: delta.slice(0, MAX_CONTENT_LENGTH),
      duration_ms: null,
    }].sort((left, right) => left.round_index - right.round_index);
  }
  return blocks.map((block) => block.round_index === roundIndex
    ? { ...block, content: `${block.content}${delta}`.slice(0, MAX_CONTENT_LENGTH) }
    : block);
}

export function completeReasoningBlock(
  blocks: ReasoningBlock[],
  roundIndex: number,
  durationMs: number,
) {
  const duration = Math.max(0, Math.round(durationMs));
  if (!blocks.some((block) => block.round_index === roundIndex)) {
    return [...blocks, { round_index: roundIndex, content: "", duration_ms: duration }]
      .sort((left, right) => left.round_index - right.round_index);
  }
  return blocks.map((block) => block.round_index === roundIndex
    ? { ...block, duration_ms: duration }
    : block);
}

export function normalizeReasoningBlocks(value: unknown): ReasoningBlock[] {
  if (!Array.isArray(value)) return [];
  const byRound = new Map<number, ReasoningBlock>();

  for (const entry of value.slice(0, MAX_BLOCKS)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (!validRoundIndex(item.round_index) || typeof item.content !== "string") continue;
    const roundIndex = item.round_index as number;
    byRound.set(roundIndex, {
      round_index: roundIndex,
      content: item.content.slice(0, MAX_CONTENT_LENGTH),
      duration_ms: validDuration(item.duration_ms) ? Math.round(item.duration_ms as number) : null,
    });
  }

  return [...byRound.values()].sort((left, right) => left.round_index - right.round_index);
}
