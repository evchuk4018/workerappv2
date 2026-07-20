import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PythonActivityCard } from "./python-activity-card";

describe("Python activity rendering", () => {
  it("renders code, logs, packages, and downloadable artifacts", () => {
    const html = renderToStaticMarkup(createElement(PythonActivityCard, {
      activity: {
        id: "python-1",
        kind: "python",
        provider: "pyodide",
        status: "completed",
        phase: "completed",
        code: "print(42)",
        packages: ["pandas"],
        installed_packages: ["pandas==2.2.3"],
        stdout: "42",
        stderr: "",
        final_value: "42",
        duration_ms: 1200,
        artifacts: [{
          id: "artifact-1",
          name: "chart.png",
          mime_type: "image/png",
          size_bytes: 2048,
          download_url: "https://example.com/chart.png",
          preview_url: "https://example.com/chart.png",
        }],
        started_at: "2026-07-18T00:00:00.000Z",
      },
    }));

    expect(html).toContain("Ran Python");
    expect(html).toContain("print(42)");
    expect(html).toContain("Packages:");
    expect(html).toContain("chart.png");
    expect(html).toContain('href="https://example.com/chart.png"');
    expect(html).toContain("Completed in 1.2s");
  });

  it("does not link unsafe artifact URLs", () => {
    const html = renderToStaticMarkup(createElement(PythonActivityCard, {
      activity: {
        id: "python-2",
        kind: "python",
        provider: "pyodide",
        status: "error",
        phase: "running",
        code: "raise RuntimeError()",
        packages: [],
        installed_packages: [],
        stdout: "",
        stderr: "traceback",
        artifacts: [{
          id: "artifact-2",
          name: "unsafe.png",
          mime_type: "image/png",
          size_bytes: 10,
          download_url: "javascript:alert(1)",
        }],
        error: "Execution failed",
        started_at: "2026-07-18T00:00:00.000Z",
      },
    }));

    expect(html).toContain("Python failed");
    expect(html).toContain("Execution failed");
    expect(html).not.toContain('href="javascript:');
  });
});
