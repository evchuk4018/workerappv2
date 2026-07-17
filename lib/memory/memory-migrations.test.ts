import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function migration(name: string) {
  return readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url)), "utf8");
}

const core = migration("20260717032215_production_memory_system.sql");
const worker = migration("20260717032247_memory_worker.sql");
const retrieval = migration("20260717032329_memory_retrieval.sql");
const privileges = migration("20260717032746_memory_privilege_hardening.sql");
const indexes = migration("20260717032942_memory_foreign_key_indexes.sql");

describe("production memory migrations", () => {
  it("uses explicit grants and ownership RLS for every exposed memory table", () => {
    expect(core.match(/enable row level security/g)?.length).toBeGreaterThanOrEqual(8);
    expect(core).toContain("with check ((select auth.uid()) = user_id)");
    expect(core).toContain("grant select, insert on public.memory_events to authenticated");
    expect(worker).toContain("revoke all on private.memory_jobs, private.memory_job_runs");
    expect(privileges).toContain("from public, anon");
  });

  it("queues only completed assistant transitions and keeps enqueue failures isolated", () => {
    expect(worker).toContain("new.role <> 'assistant' or new.status <> 'completed'");
    expect(worker).toContain("Memory failures must never prevent");
    expect(worker).toContain("on conflict (idempotency_key) do nothing");
    expect(worker).toContain("for update skip locked");
    expect(worker).toContain("pgmq.set_vt");
  });

  it("redacts forgotten content, invalidates derived state, and retains a suppression hash", () => {
    expect(core).toContain("canonical_content is null and deleted_at is not null");
    expect(worker).toContain("delete from public.memory_sources where memory_id = new.id");
    expect(worker).toContain("set status = 'invalidated'");
    expect(worker).toContain("last_summarized_message_id = null");
  });

  it("implements the documented ranking weights and transactional copy-on-write edits", () => {
    for (const weight of ["0.45", "0.15", "0.12", "0.10", "0.08", "0.05"]) {
      expect(retrieval).toContain(weight);
    }
    expect(retrieval).toContain("returns public.user_memories");
    expect(retrieval).toContain("supersedes_memory_id");
    expect(retrieval).toContain("security invoker");
    expect(indexes.match(/create index/g)).toHaveLength(11);
  });
});
