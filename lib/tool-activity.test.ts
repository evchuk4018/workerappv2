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
    const activity = normalized[0];
    if (activity.kind === "python") throw new Error("Expected web activity");
    expect(activity.query).toHaveLength(500);
    expect(activity.sources[0].snippet).toHaveLength(500);
    expect(activity).toMatchObject({ round_index: 2, call_index: 1 });
  });

  it("normalizes Python details without changing meaningful code whitespace", () => {
    const normalized = normalizeToolActivities([{
      id: "python-1",
      kind: "python",
      provider: "pyodide",
      status: "completed",
      phase: "completed",
      code: "  value = 42\nprint(value)",
      packages: ["pandas"],
      installed_packages: ["pandas==2.2.3"],
      stdout: "42\n",
      stderr: "",
      final_value: "42",
      duration_ms: 250,
      artifacts: [{
        id: "file-1",
        name: "chart.png",
        mime_type: "image/png",
        size_bytes: 1024,
        download_url: "https://example.com/chart.png",
      }],
      started_at: "2026-01-01T00:00:00.000Z",
    }]);

    expect(normalized).toHaveLength(1);
    const activity = normalized[0];
    if (activity.kind !== "python") throw new Error("Expected Python activity");
    expect(activity.code).toBe("  value = 42\nprint(value)");
    expect(activity.stdout).toBe("42\n");
    expect(activity.artifacts[0]).toMatchObject({ name: "chart.png", size_bytes: 1024 });
  });
});
