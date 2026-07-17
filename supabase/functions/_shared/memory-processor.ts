import { mergeUsage, EMPTY_USAGE } from "./memory-model.ts";
import { type MemoryJob, type SqlClient } from "./memory-db.ts";
import { processExchange, type HandlerResult } from "./memory-extraction.ts";
import { maybeSummarize } from "./memory-summary.ts";
import { maybeQueueDream, processDream } from "./memory-dream.ts";

export async function processMemoryJob(
  sql: SqlClient,
  job: MemoryJob,
  apiKey: string,
): Promise<HandlerResult> {
  if (job.job_type === "dream") return processDream(sql, job, apiKey);
  if (job.job_type === "redact") {
    await maybeQueueDream(sql, job);
    return { model: null, usage: EMPTY_USAGE, modelDurationMs: 0 };
  }
  if (job.job_type === "summary") {
    const summary = await maybeSummarize(sql, job, apiKey);
    await maybeQueueDream(sql, job);
    return summary;
  }

  const extraction = await processExchange(sql, job, apiKey);
  const summary = await maybeSummarize(sql, job, apiKey);
  await maybeQueueDream(sql, job);
  return {
    model: extraction.model ?? summary.model,
    usage: mergeUsage(extraction.usage, summary.usage),
    modelDurationMs: extraction.modelDurationMs + summary.modelDurationMs,
  };
}

