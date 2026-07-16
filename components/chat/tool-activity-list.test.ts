import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolActivityList } from "./tool-activity-list";

describe("tool activity rendering", () => {
  it("renders an expandable search with safe source links and snippets", () => {
    const html = renderToStaticMarkup(createElement(ToolActivityList, {
      activities: [{
        id: "search-1",
        kind: "search",
        provider: "brave",
        status: "completed",
        query: "best TypeScript patterns",
        sources: [{
          title: "TypeScript handbook",
          url: "https://www.typescriptlang.org/docs/",
          snippet: "Official language documentation.",
        }],
        started_at: "2026-07-16T00:00:00.000Z",
        completed_at: "2026-07-16T00:00:01.000Z",
      }],
    }));

    expect(html).toContain("Searched for");
    expect(html).toContain("best TypeScript patterns");
    expect(html).toContain("<details");
    expect(html).toContain('href="https://www.typescriptlang.org/docs/"');
    expect(html).toContain("Official language documentation.");
  });

  it("does not turn unsafe provider URLs into links", () => {
    const html = renderToStaticMarkup(createElement(ToolActivityList, {
      activities: [{
        id: "search-2",
        kind: "search",
        provider: "brave",
        status: "completed",
        query: "unsafe",
        sources: [{ title: "Unsafe", url: "javascript:alert(1)", snippet: "" }],
        started_at: "2026-07-16T00:00:00.000Z",
      }],
    }));

    expect(html).toContain("Unsafe");
    expect(html).not.toContain("javascript:alert(1)\"");
  });
});
