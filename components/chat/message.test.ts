import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/types";
import { Message } from "./message";

function renderAssistant(content: string): string {
  const message: ChatMessage = {
    id: "message-1",
    conversation_id: "conversation-1",
    role: "assistant",
    content,
    reasoning_content: null,
    reasoning_blocks: [],
    tool_activity: [],
    model_preset: null,
    status: "completed",
    duration_ms: 100,
    created_at: "2026-07-15T00:00:00.000Z",
  };

  return renderToStaticMarkup(createElement(Message, { message }));
}

describe("assistant Markdown rendering", () => {
  it("renders GFM tables, task lists, and footnotes", () => {
    const html = renderAssistant(`## Comparison

- [x] Complete

| Item | State |
| --- | --- |
| Build | Ready |

More detail[^1].

[^1]: Footnote detail.`);

    expect(html).toContain("<h2>Comparison</h2>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain("data-footnotes");
  });

  it("renders KaTeX math and highlighted language-tagged code", () => {
    const html = renderAssistant(String.raw`Inline $x^2$.

$$
\frac{1}{2}
$$

~~~typescript
const answer: number = 42;
~~~`);

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('class="hljs language-typescript"');
    expect(html).toContain("hljs-keyword");
  });

  it("keeps unsafe or unsupported rich content readable", () => {
    const html = renderAssistant(String.raw`![Diagram](https://example.com/diagram.png)

<script>alert("unsafe")</script>

$\notacommand{$

~~~not-a-language
<thing>
~~~`);

    expect(html).toContain('<a href="https://example.com/diagram.png">Diagram</a>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("katex-error");
    expect(html).toContain("language-not-a-language");
    expect(html).not.toContain("hljs-name");
    expect(html).toContain("&lt;thing&gt;");
  });
});

describe("assistant reasoning blocks", () => {
  it("renders separate collapsed rounds with tool cards inside the matching block", () => {
    const message: ChatMessage = {
      id: "message-2",
      conversation_id: "conversation-1",
      role: "assistant",
      content: "Final answer",
      reasoning_content: "First thoughtSecond thought",
      reasoning_blocks: [
        { round_index: 0, content: "First thought", duration_ms: 1200 },
        { round_index: 1, content: "Second thought", duration_ms: 800 },
      ],
      tool_activity: [{
        id: "search-1",
        kind: "search",
        provider: "brave",
        status: "completed",
        round_index: 0,
        call_index: 0,
        query: "current answer",
        sources: [],
        started_at: "2026-07-16T00:00:00.000Z",
      }],
      model_preset: "medium",
      status: "completed",
      duration_ms: 5000,
      created_at: "2026-07-16T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(createElement(Message, { message }));
    expect(html.match(/class="thinking-block"/g)).toHaveLength(2);
    expect(html).not.toContain('<details class="thinking-block" open=""');
    expect(html.indexOf("First thought")).toBeLessThan(html.indexOf("Searched for"));
    expect(html.indexOf("Searched for")).toBeLessThan(html.indexOf("Second thought"));
    expect(html).toContain("Thought for 1s");
    expect(html).toContain("Thought for under a second");
  });

  it("falls back to one collapsed block for legacy flattened traces", () => {
    const message: ChatMessage = {
      id: "message-3",
      conversation_id: "conversation-1",
      role: "assistant",
      content: "Answer",
      reasoning_content: "Legacy thought",
      reasoning_blocks: [],
      tool_activity: [],
      model_preset: "medium",
      status: "completed",
      duration_ms: 1500,
      created_at: "2026-07-16T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(createElement(Message, { message }));
    expect(html.match(/class="thinking-block"/g)).toHaveLength(1);
    expect(html).toContain("Legacy thought");
  });
});

describe("user attachments", () => {
  it("renders attached file metadata below the user message", () => {
    const message: ChatMessage = {
      id: "message-4",
      conversation_id: "conversation-1",
      role: "user",
      content: "Analyze this file",
      reasoning_content: null,
      reasoning_blocks: [],
      tool_activity: [],
      model_preset: null,
      status: "completed",
      duration_ms: null,
      created_at: "2026-07-18T00:00:00.000Z",
      attachments: [{
        id: "file-1",
        name: "sales.csv",
        mime_type: "text/csv",
        size_bytes: 2048,
        created_at: "2026-07-18T00:00:00.000Z",
      }],
    };

    const html = renderToStaticMarkup(createElement(Message, { message }));
    expect(html).toContain("Analyze this file");
    expect(html).toContain("sales.csv");
    expect(html).toContain("2 KB");
  });
});
