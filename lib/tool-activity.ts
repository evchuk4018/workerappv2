export type ToolActivityStatus = "running" | "completed" | "error";
export type ExtractionMode = "full" | "focused" | "partial";
export type PythonActivityPhase =
  | "queued"
  | "loading"
  | "installing"
  | "running"
  | "uploading"
  | "completed";

export interface ToolSource {
  title: string;
  url: string;
  snippet: string;
}

export interface PythonArtifact {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  download_url?: string;
  preview_url?: string;
}

interface BaseToolActivity {
  id: string;
  status: ToolActivityStatus;
  round_index?: number;
  call_index?: number;
  error?: string;
  started_at: string;
  completed_at?: string;
}

export interface WebToolActivity extends BaseToolActivity {
  kind: "search" | "read";
  provider: "brave" | "tavily";
  query?: string;
  url?: string;
  extraction_mode?: ExtractionMode;
  sources: ToolSource[];
}

export interface PythonToolActivity extends BaseToolActivity {
  kind: "python";
  provider: "pyodide";
  phase: PythonActivityPhase;
  code: string;
  packages: string[];
  installed_packages: string[];
  stdout: string;
  stderr: string;
  final_value?: string;
  duration_ms?: number;
  artifacts: PythonArtifact[];
}

export type ToolActivity = WebToolActivity | PythonToolActivity;

const TEXT_LIMIT = 500;
const CODE_LIMIT = 50_000;
const LOG_LIMIT = 20_000;

function cleanIndex(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function cleanText(value: unknown, limit = TEXT_LIMIT) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanRawText(value: unknown, limit: number) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((item) => {
    const text = cleanText(item, 160);
    return text ? [text] : [];
  });
}

function commonFields(item: Record<string, unknown>) {
  const roundIndex = cleanIndex(item.round_index);
  const callIndex = cleanIndex(item.call_index);
  return {
    ...(roundIndex !== undefined ? { round_index: roundIndex } : {}),
    ...(callIndex !== undefined ? { call_index: callIndex } : {}),
    ...(cleanText(item.error, 2_000) ? { error: cleanText(item.error, 2_000) } : {}),
    started_at: cleanText(item.started_at, 64) || new Date(0).toISOString(),
    ...(cleanText(item.completed_at, 64)
      ? { completed_at: cleanText(item.completed_at, 64) }
      : {}),
  };
}

function normalizeArtifacts(value: unknown): PythonArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((entry): PythonArtifact[] => {
    if (!entry || typeof entry !== "object") return [];
    const artifact = entry as Record<string, unknown>;
    const id = cleanText(artifact.id, 160);
    const name = cleanText(artifact.name, 255);
    const size = cleanIndex(artifact.size_bytes);
    if (!id || !name || size === undefined) return [];
    return [{
      id,
      name,
      mime_type: cleanText(artifact.mime_type, 160) || "application/octet-stream",
      size_bytes: size,
      ...(cleanText(artifact.download_url, 2_048)
        ? { download_url: cleanText(artifact.download_url, 2_048) }
        : {}),
      ...(cleanText(artifact.preview_url, 2_048)
        ? { preview_url: cleanText(artifact.preview_url, 2_048) }
        : {}),
    }];
  });
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
    const status = item.status === "running" || item.status === "completed" || item.status === "error"
      ? item.status
      : null;
    const id = cleanText(item.id, 160);
    if (!id || !status) return [];

    if (item.kind === "python" && item.provider === "pyodide") {
      const phase = item.phase === "queued" || item.phase === "loading"
        || item.phase === "installing" || item.phase === "running"
        || item.phase === "uploading" || item.phase === "completed"
        ? item.phase
        : status === "completed" ? "completed" : "running";
      const duration = cleanIndex(item.duration_ms);
      return [{
        id,
        kind: "python",
        provider: "pyodide",
        status,
        phase,
        code: cleanRawText(item.code, CODE_LIMIT),
        packages: cleanStringList(item.packages),
        installed_packages: cleanStringList(item.installed_packages),
        stdout: cleanRawText(item.stdout, LOG_LIMIT),
        stderr: cleanRawText(item.stderr, LOG_LIMIT),
        ...(cleanRawText(item.final_value, LOG_LIMIT)
          ? { final_value: cleanRawText(item.final_value, LOG_LIMIT) }
          : {}),
        ...(duration !== undefined ? { duration_ms: duration } : {}),
        artifacts: normalizeArtifacts(item.artifacts),
        ...commonFields(item),
      }];
    }

    const kind = item.kind === "search" || item.kind === "read" ? item.kind : null;
    const provider = item.provider === "brave" || item.provider === "tavily"
      ? item.provider
      : null;
    if (!kind || !provider) return [];
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
      ...commonFields(item),
    }];
  });
}
