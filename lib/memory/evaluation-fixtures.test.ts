import { describe, expect, it } from "vitest";
import fixtures from "./evaluation-fixtures.json";

describe("multi-conversation memory evaluation fixtures", () => {
  it("covers corrections, stale context, irrelevant personalization, forgetting, and cross-chat retrieval", () => {
    expect(fixtures.map((fixture) => fixture.case)).toEqual([
      "correction", "stale-context", "irrelevant-personalization", "explicit-forgetting", "cross-conversation",
    ]);
    for (const fixture of fixtures) {
      expect(fixture.query.length).toBeGreaterThan(5);
      expect(new Set([...fixture.relevant, ...fixture.irrelevant]).size)
        .toBe(fixture.relevant.length + fixture.irrelevant.length);
    }
  });
});
