import type { ExtractionMode } from "@/lib/tool-activity";
import {
  type Fetcher,
  ProviderKeyPool,
  ProviderRequestError,
  readJsonResponse,
  requestSignal,
} from "@/lib/web/key-failover";
import { parsePublicUrl } from "@/lib/web/public-url";

const FULL_PAGE_LIMIT = 60_000;

interface TavilyPayload {
  results?: unknown;
  failed_results?: unknown;
}

export interface PageReadResult {
  content: string;
  mode: ExtractionMode;
  title: string;
  url: string;
}

function extractionContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new ProviderRequestError("Tavily returned malformed data.", true);
  }
  const results = (payload as TavilyPayload).results;
  if (!Array.isArray(results)) {
    throw new ProviderRequestError("Tavily returned malformed data.", true);
  }
  const first = results[0];
  if (!first || typeof first !== "object") {
    throw new ProviderRequestError("Tavily could not extract this page.", false);
  }
  const value = first as { raw_content?: unknown; url?: unknown };
  if (typeof value.raw_content !== "string" || !value.raw_content.trim()) {
    throw new ProviderRequestError("Tavily could not extract this page.", false);
  }
  return { content: value.raw_content, url: typeof value.url === "string" ? value.url : "" };
}

export class TavilyExtractClient {
  readonly pool: ProviderKeyPool;

  constructor(keys: readonly string[], private readonly fetcher: Fetcher = fetch) {
    this.pool = new ProviderKeyPool(keys);
  }

  private async extract(
    url: string,
    signal: AbortSignal,
    focus?: string,
  ) {
    return this.pool.run(async (key) => {
      let response: Response;
      try {
        response = await this.fetcher("https://api.tavily.com/extract", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            urls: [url],
            extract_depth: "advanced",
            format: "markdown",
            include_images: false,
            include_usage: false,
            timeout: 30,
            ...(focus ? { query: focus, chunks_per_source: 5 } : {}),
          }),
          signal: requestSignal(signal, 35_000),
        });
      } catch {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        throw new ProviderRequestError("Tavily could not be reached.", true);
      }
      return extractionContent(await readJsonResponse(response));
    });
  }

  async read(urlValue: unknown, focusValue: unknown, signal: AbortSignal): Promise<PageReadResult> {
    const url = parsePublicUrl(urlValue).toString();
    const focus = typeof focusValue === "string" ? focusValue.trim().slice(0, 2_000) : "";
    if (!focus) throw new TypeError("A focus question is required when reading a webpage.");

    const full = await this.extract(url, signal);
    if (full.content.length <= FULL_PAGE_LIMIT) {
      return { content: full.content, mode: "full", title: new URL(url).hostname, url };
    }

    try {
      const focused = await this.extract(url, signal, focus);
      return {
        content: focused.content.slice(0, FULL_PAGE_LIMIT),
        mode: "focused",
        title: new URL(url).hostname,
        url,
      };
    } catch (caught) {
      if (signal.aborted) throw caught;
      return {
        content: `${full.content.slice(0, FULL_PAGE_LIMIT)}\n\n[Page truncated because focused extraction failed.]`,
        mode: "partial",
        title: new URL(url).hostname,
        url,
      };
    }
  }
}
