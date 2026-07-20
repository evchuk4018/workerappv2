import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttachmentChips } from "./attachment-chips";

describe("attachment chips", () => {
  it("shows file metadata and exposes removal by file ID", () => {
    const html = renderToStaticMarkup(createElement(AttachmentChips, {
      attachments: [{
        id: "file-1",
        name: "sales.csv",
        mime_type: "text/csv",
        size_bytes: 2048,
        created_at: "2026-07-18T00:00:00.000Z",
        state: "ready",
      }],
      onRemove: () => undefined,
    }));

    expect(html).toContain("sales.csv");
    expect(html).toContain("2 KB");
    expect(html).toContain('aria-label="Remove sales.csv"');
  });

  it("shows upload errors without a file-size replacement leak", () => {
    const html = renderToStaticMarkup(createElement(AttachmentChips, {
      attachments: [{
        id: "file-2",
        name: "data.xlsx",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 4096,
        created_at: "2026-07-18T00:00:00.000Z",
        state: "error",
        error: "Upload failed",
      }],
    }));

    expect(html).toContain("Upload failed");
    expect(html).not.toContain("4 KB");
  });
});
