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
