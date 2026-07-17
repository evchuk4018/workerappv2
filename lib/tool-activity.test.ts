import { describe, expect, it } from "vitest";
import { normalizeToolActivities, upsertToolActivity } from "./tool-activity";

describe("tool activity metadata", () => {
  it("replaces an activity by tool ID without changing its order", () => {
    const running = {
      id: "search-1",
      kind: "search" as const,
      provider: "brave" as const,
      status: "running" as const,
      sources: [],
      started_at: "2026-01-01T00:00:00.000Z",
    };
    const completed = { ...running, status: "completed" as const };

    expect(upsertToolActivity([running], completed)).toEqual([completed]);
  });

  it("sanitizes persisted activity and drops malformed records", () => {
    const normalized = normalizeToolActivities([
      {
        id: "search-1",
        kind: "search",
        provider: "brave",
        status: "completed",
        round_index: 2,
        call_index: 1,
        query: "x".repeat(700),
        sources: [{ title: "Source", url: "https://example.com", snippet: "y".repeat(700) }],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      { id: "bad", kind: "unknown" },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].query).toHaveLength(500);
    expect(normalized[0].sources[0].snippet).toHaveLength(500);
    expect(normalized[0]).toMatchObject({ round_index: 2, call_index: 1 });
  });
});
