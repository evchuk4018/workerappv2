import { describe, expect, it } from "vitest";
import {
  appendReasoningDelta,
  completeReasoningBlock,
  normalizeReasoningBlocks,
} from "./reasoning-block";

describe("reasoning blocks", () => {
  it("appends deltas by round and completes each round independently", () => {
    let blocks = appendReasoningDelta([], 1, "Second");
    blocks = appendReasoningDelta(blocks, 0, "First ");
    blocks = appendReasoningDelta(blocks, 0, "round");
    blocks = completeReasoningBlock(blocks, 0, 1234.4);

    expect(blocks).toEqual([
      { round_index: 0, content: "First round", duration_ms: 1234 },
      { round_index: 1, content: "Second", duration_ms: null },
    ]);
  });

  it("normalizes, sorts, and deduplicates persisted blocks", () => {
    const blocks = normalizeReasoningBlocks([
      { round_index: 2, content: "Third", duration_ms: -1 },
      { round_index: 0, content: "Old", duration_ms: 100 },
      { round_index: 0, content: "First", duration_ms: 200.6 },
      { round_index: -1, content: "Invalid", duration_ms: 10 },
      { round_index: 1, content: 42, duration_ms: 10 },
    ]);

    expect(blocks).toEqual([
      { round_index: 0, content: "First", duration_ms: 201 },
      { round_index: 2, content: "Third", duration_ms: null },
    ]);
  });
});
