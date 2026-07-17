import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { processMemoryJob } from "../_shared/memory-processor.ts";
import { sanitizedErrorCode, type MemoryJob, type SqlClient } from "../_shared/memory-db.ts";

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("DATABASE_URL");
  if (!databaseUrl) return new Response("Worker is not configured", { status: 503 });

  const client = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  const sql = client as unknown as SqlClient;
  let completed = 0;
  let failed = 0;
  try {
    const secrets = await sql.unsafe<{ name: string; decrypted_secret: string }>(`
      select name, decrypted_secret from vault.decrypted_secrets
      where name in ('memory_worker_secret','deepseek_api_key')
    `);
    const value = (name: string) => secrets.find((secret) => secret.name === name)?.decrypted_secret ?? "";
    const expectedSecret = value("memory_worker_secret");
    const receivedSecret = request.headers.get("x-memory-worker-secret") ?? "";
    if (!expectedSecret || !safeEqual(expectedSecret, receivedSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY") ?? value("deepseek_api_key");
    if (!apiKey) return new Response("Worker is not configured", { status: 503 });
    const jobs = await sql.unsafe<MemoryJob>("select * from private.claim_memory_jobs(5)");
    for (const job of jobs) {
      const startedAt = Date.now();
      try {
        const result = await processMemoryJob(sql, job, apiKey);
        await sql.unsafe("select private.finish_memory_job($1,$2,true,$3,$4,$5::jsonb,null)", [
          job.job_id,
          job.queue_message_id,
          Date.now() - startedAt,
          result.model,
          JSON.stringify(result.usage),
        ]);
        completed += 1;
      } catch (error) {
        await sql.unsafe("select private.finish_memory_job($1,$2,false,$3,null,'{}'::jsonb,$4)", [
          job.job_id,
          job.queue_message_id,
          Date.now() - startedAt,
          sanitizedErrorCode(error),
        ]);
        failed += 1;
      }
    }
    return Response.json({ completed, failed });
  } catch {
    return Response.json({ error: "Worker dispatch failed." }, { status: 500 });
  } finally {
    await sql.end({ timeout: 2 });
  }
});
