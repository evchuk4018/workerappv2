import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260717004353_add_message_reasoning_blocks.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("reasoning block migration", () => {
  it("adds an array-shaped JSONB column without changing existing rows", () => {
    expect(migration).toContain("add column reasoning_blocks jsonb not null default '[]'::jsonb");
    expect(migration).toContain("jsonb_typeof(reasoning_blocks) = 'array'");
    expect(migration).not.toContain("update public.messages");
  });
});
