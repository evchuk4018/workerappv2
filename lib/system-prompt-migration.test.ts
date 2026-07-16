import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/20260716024411_add_system_prompt_settings.sql",
  import.meta.url,
));
const migration = readFileSync(migrationPath, "utf8");

describe("system prompt settings migration", () => {
  it("enables RLS and scopes every settings policy to its owner", () => {
    expect(migration).toContain("alter table public.user_settings enable row level security");
    expect(migration.match(/\(\(select auth\.uid\(\)\) = user_id\)/g)).toHaveLength(4);
    expect(migration).toContain("grant select, insert, update on table public.user_settings to authenticated");
  });

  it("bounds both stored prompt copies", () => {
    expect(migration.match(/char_length\(system_prompt\) <= 20000/g)).toHaveLength(2);
    expect(migration).toContain("add column system_prompt text not null default ''");
    expect(migration).toContain("revoke update on table public.conversations from authenticated");
    expect(migration).toContain(
      "grant update (title, updated_at) on table public.conversations to authenticated",
    );
  });
});
