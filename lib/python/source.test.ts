import { describe, expect, it } from "vitest";
import { PYODIDE_MODULE_URL } from "./constants";
import { createPythonIframeSource } from "./iframe-source";
import { createPythonWorkerSource } from "./worker-source";

describe("Python sandbox sources", () => {
  it("generates syntactically valid module-worker JavaScript", () => {
    const source = createPythonWorkerSource("nonce");
    const withoutImport = source.replace(/^\s*import \{ loadPyodide \} from [^;]+;/, "");

    expect(source).toContain(PYODIDE_MODULE_URL);
    expect(source).toContain("loadPackagesFromImports");
    expect(source).toContain("_runner_micropip.install");
    expect(source).toContain("savefig");
    expect(() => new Function(withoutImport)).not.toThrow();
  });

  it("safely embeds the worker in an opaque iframe bootstrap", () => {
    const worker = createPythonWorkerSource("nonce");
    const html = createPythonIframeSource("nonce", "https://app.example", worker);
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

    expect(script).toBeDefined();
    if (!script) throw new Error("Iframe bootstrap script is missing.");
    expect(html).not.toContain("allow-same-origin");
    expect(script).toContain("new Worker(url, { type: \"module\"");
    expect(() => new Function(script)).not.toThrow();
  });
});
