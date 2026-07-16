import type { ToolSource } from "@/lib/tool-activity";
import {
  type Fetcher,
  ProviderKeyPool,
  ProviderRequestError,
  readJsonResponse,
  requestSignal,
} from "@/lib/web/key-failover";

interface BraveGrounding {
  url?: unknown;
  title?: unknown;
  snippets?: unknown;
}

export interface BraveSearchResult {
  content: string;
  sources: ToolSource[];
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export class BraveSearchClient {
  readonly pool: ProviderKeyPool;

  constructor(keys: readonly string[], private readonly fetcher: Fetcher = fetch) {
    this.pool = new ProviderKeyPool(keys);
  }

  async search(query: string, signal: AbortSignal): Promise<BraveSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > 400 || normalizedQuery.split(/\s+/).length > 50) {
      throw new TypeError("Search queries must contain 1-400 characters and no more than 50 words.");
    }

    return this.pool.run(async (key) => {
      let response: Response;
      try {
        response = await this.fetcher("https://api.search.brave.com/res/v1/llm/context", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Subscription-Token": key,
          },
          body: JSON.stringify({
            q: normalizedQuery,
            country: "us",
            search_lang: "en",
            count: 20,
            maximum_number_of_urls: 10,
            maximum_number_of_tokens: 8192,
            context_threshold_mode: "balanced",
            enable_source_metadata: true,
          }),
          signal: requestSignal(signal, 30_000),
        });
      } catch {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        throw new ProviderRequestError("Brave Search could not be reached.", true);
      }

      const payload = await readJsonResponse(response);
      if (!payload || typeof payload !== "object") {
        throw new ProviderRequestError("Brave Search returned malformed data.", true);
      }
      const grounding = (payload as { grounding?: { generic?: unknown } }).grounding?.generic;
      if (!Array.isArray(grounding)) {
        throw new ProviderRequestError("Brave Search returned malformed data.", true);
      }

      const normalized = grounding.slice(0, 10).flatMap((entry): Array<{
        title: string;
        url: string;
        snippets: string[];
      }> => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as BraveGrounding;
        const url = text(item.url, 2_048);
        if (!url) return [];
        const snippets = Array.isArray(item.snippets)
          ? item.snippets.map((snippet) => text(snippet, 8_000)).filter(Boolean)
          : [];
        return [{ title: text(item.title, 500) || url, url, snippets }];
      });

      return {
        content: JSON.stringify({ query: normalizedQuery, sources: normalized }),
        sources: normalized.map((source) => ({
          title: source.title,
          url: source.url,
          snippet: source.snippets.join(" ").slice(0, 500),
        })),
      };
    });
  }
}
