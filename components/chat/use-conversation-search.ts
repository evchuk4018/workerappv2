import { useEffect, useState } from "react";
import type { ConversationSummary } from "@/lib/types";

export function useConversationSearch(open: boolean, initial: ConversationSummary[]) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(initial);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/conversations?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { conversations: ConversationSummary[] };
        setResults(data.conversations);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          // Keep the previous results if search is temporarily unavailable.
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query]);

  return { query, setQuery, results };
}
