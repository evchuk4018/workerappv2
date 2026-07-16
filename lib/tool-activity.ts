export type ToolActivityStatus = "running" | "completed" | "error";
export type ExtractionMode = "full" | "focused" | "partial";

export interface ToolSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ToolActivity {
  id: string;
  kind: "search" | "read";
  provider: "brave" | "tavily";
  status: ToolActivityStatus;
  query?: string;
  url?: string;
  extraction_mode?: ExtractionMode;
  sources: ToolSource[];
  error?: string;
  started_at: string;
  completed_at?: string;
}

const TEXT_LIMIT = 500;

function cleanText(value: unknown, limit = TEXT_LIMIT) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function upsertToolActivity(items: ToolActivity[], activity: ToolActivity) {
  const index = items.findIndex((item) => item.id === activity.id);
  if (index < 0) return [...items, activity];
  return items.map((item, itemIndex) => itemIndex === index ? activity : item);
}

export function normalizeToolActivities(value: unknown): ToolActivity[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 50).flatMap((entry): ToolActivity[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const kind = item.kind === "search" || item.kind === "read" ? item.kind : null;
    const provider = item.provider === "brave" || item.provider === "tavily"
      ? item.provider
      : null;
    const status = item.status === "running" || item.status === "completed" || item.status === "error"
      ? item.status
      : null;
    const id = cleanText(item.id, 160);
    if (!id || !kind || !provider || !status) return [];

    const extractionMode = item.extraction_mode === "full"
      || item.extraction_mode === "focused"
      || item.extraction_mode === "partial"
      ? item.extraction_mode
      : undefined;
    const sources = Array.isArray(item.sources)
      ? item.sources.slice(0, 10).flatMap((source): ToolSource[] => {
          if (!source || typeof source !== "object") return [];
          const candidate = source as Record<string, unknown>;
          const url = cleanText(candidate.url, 2_048);
          if (!url) return [];
          return [{
            title: cleanText(candidate.title) || url,
            url,
            snippet: cleanText(candidate.snippet),
          }];
        })
      : [];

    return [{
      id,
      kind,
      provider,
      status,
      ...(cleanText(item.query) ? { query: cleanText(item.query) } : {}),
      ...(cleanText(item.url, 2_048) ? { url: cleanText(item.url, 2_048) } : {}),
      ...(extractionMode ? { extraction_mode: extractionMode } : {}),
      sources,
      ...(cleanText(item.error) ? { error: cleanText(item.error) } : {}),
      started_at: cleanText(item.started_at, 64) || new Date(0).toISOString(),
      ...(cleanText(item.completed_at, 64)
        ? { completed_at: cleanText(item.completed_at, 64) }
        : {}),
    }];
  });
}
