import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260716041552_add_title_finalization.sql", import.meta.url),
  "utf8",
);

describe("title finalization migration", () => {
  it("adds and backfills the title lifecycle marker", () => {
    expect(migration).toContain("add column title_finalized_at timestamptz");
    expect(migration).toContain("set title_finalized_at = updated_at");
  });

  it("keeps authenticated updates column-scoped", () => {
    expect(migration).toContain("revoke update on table public.conversations from authenticated");
    expect(migration).toContain("grant update (title, title_finalized_at, updated_at)");
  });
});
