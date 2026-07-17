import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  parseExtractionOperations,
  parseProfileClaims,
  parseSummary,
  targetedOperationDecision,
  validateProfileCandidate,
} from "../../supabase/functions/_shared/memory-validation";

describe("worker JSON validation", () => {
  it("accepts only bounded, typed extraction operations", () => {
    expect(parseExtractionOperations({ operations: [{
      op: "create", memory_type: "preference", stable_key: "editor",
      content: " Uses VS Code ", confidence: 0.91, salience: 0.7,
    }] })[0]).toMatchObject({ content: "Uses VS Code", confidence: 0.91 });
    expect(() => parseExtractionOperations({ operations: [{ op: "delete" }] })).toThrow("missing_target");
    expect(() => parseExtractionOperations({ operations: Array(11).fill({ op: "none" }) })).toThrow("too_many_operations");
  });

  it("requires atomic provenance for every dream claim", () => {
    expect(parseProfileClaims({ claims: [{ text: "Prefers concise answers", memory_ids: ["m1", "m1"] }] }))
      .toEqual([{ text: "Prefers concise answers", memory_ids: ["m1"] }]);
    expect(() => parseProfileClaims({ claims: [{ text: "Unsupported", memory_ids: [] }] }))
      .toThrow("profile_claim_without_atomic_source");
    expect(estimateTokens("a".repeat(1800))).toBe(600);
    expect(validateProfileCandidate(
      [{ text: "Prefers concise answers", memory_ids: ["m1"] }],
      new Set(["m1"]),
      new Set(["m1"]),
    ).profileText).toContain("concise");
    expect(() => validateProfileCandidate(
      [{ text: "Unsupported", memory_ids: ["m2"] }], new Set(["m1"]), new Set(),
    )).toThrow("profile_has_unsupported_claim");
  });

  it("enforces explicit authority, reversal, pinning, and direct forget cues", () => {
    expect(targetedOperationDecision({ operation: "supersede", explicit: false, forgetCue: false,
      targetPinned: false, targetOrigin: "explicit" })).toBe("review");
    expect(targetedOperationDecision({ operation: "expire", explicit: false, forgetCue: false,
      targetPinned: true, targetOrigin: "inferred" })).toBe("ignore");
    expect(targetedOperationDecision({ operation: "delete", explicit: true, forgetCue: false,
      targetPinned: false, targetOrigin: "explicit" })).toBe("ignore");
    expect(targetedOperationDecision({ operation: "delete", explicit: true, forgetCue: true,
      targetPinned: true, targetOrigin: "explicit" })).toBe("apply");
  });

  it("requires every incremental summary field and preserves corrections", () => {
    const summary = parseSummary({
      summary_text: "The user corrected the target date.",
      main_topics: ["launch"], decisions: ["move date"], current_state: ["planning"],
      open_tasks: [], entities: [], dates: ["2026-08-01"], progress: [],
    });
    expect(summary.decisions).toEqual(["move date"]);
    expect(() => parseSummary({ summary_text: "Incomplete" })).toThrow("invalid_summary_main_topics");
  });
});
