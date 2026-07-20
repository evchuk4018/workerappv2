import {
  PYODIDE_INDEX_URL,
  PYODIDE_MODULE_URL,
  PYTHON_MAX_INPUT_BYTES,
  PYTHON_MAX_OUTPUT_BYTES,
  PYTHON_MAX_OUTPUTS,
  PYTHON_PROTOCOL_CHANNEL,
  PYTHON_PROTOCOL_VERSION,
} from "./constants";

export function createPythonWorkerSource(nonce: string) {
  return `
import { loadPyodide } from ${JSON.stringify(PYODIDE_MODULE_URL)};

const CHANNEL = ${JSON.stringify(PYTHON_PROTOCOL_CHANNEL)};
const VERSION = ${PYTHON_PROTOCOL_VERSION};
const NONCE = ${JSON.stringify(nonce)};
const MAX_INPUT_BYTES = ${PYTHON_MAX_INPUT_BYTES};
const MAX_OUTPUT_BYTES = ${PYTHON_MAX_OUTPUT_BYTES};
const MAX_OUTPUTS = ${PYTHON_MAX_OUTPUTS};
const ROOT = "/mnt/data";
const INPUTS = ROOT + "/inputs";
const OUTPUTS = ROOT + "/outputs";
const pyodidePromise = loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_INDEX_URL)} });
let running = false;

const ownRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const safePath = (path) => typeof path === "string" && path.length > 0 && path.length <= 240
  && !path.startsWith("/") && !path.endsWith("/") && !path.includes("\\\\")
  && path.split("/").every((part) => part && part !== "." && part !== ".." && !/[\\0-\\x1f:*?\"<>|]/.test(part));

function validRun(message) {
  if (!ownRecord(message) || !exact(message, ["channel", "version", "nonce", "type", "requestId", "payload"])
    || message.channel !== CHANNEL || message.version !== VERSION || message.nonce !== NONCE
    || message.type !== "run" || typeof message.requestId !== "string" || !message.requestId
    || !ownRecord(message.payload) || !exact(message.payload, ["code", "packages", "inputs"])) return false;
  const { code, packages, inputs } = message.payload;
  if (typeof code !== "string" || code.length > 1000000 || !Array.isArray(packages)
    || packages.length > 32 || packages.some((item) => typeof item !== "string" || !item || item.length > 512)
    || !Array.isArray(inputs) || inputs.length > 100) return false;
  let total = 0;
  const paths = new Set();
  for (const input of inputs) {
    if (!ownRecord(input) || !exact(input, ["path", "mimeType", "data"])
      || !safePath(input.path) || paths.has(input.path) || typeof input.mimeType !== "string"
      || input.mimeType.length > 200 || !(input.data instanceof ArrayBuffer)) return false;
    paths.add(input.path);
    total += input.data.byteLength;
  }
  return total <= MAX_INPUT_BYTES;
}

function send(type, requestId, payload, transfer = []) {
  self.postMessage({ channel: CHANNEL, version: VERSION, nonce: NONCE, type, requestId, payload }, transfer);
}

function phase(requestId, value) {
  send("phase", requestId, { phase: value });
}

function limitedWriter(chunks) {
  let length = 0;
  return (text) => {
    if (length >= 1000000) return;
    const available = 1000000 - length;
    const value = String(text).slice(0, available);
    chunks.push(value);
    length += value.length;
    if (length === 1000000) chunks.push("\\n[output truncated]");
  };
}

function packageList(pyodide) {
  const json = pyodide.runPython(\`
import importlib.metadata as _runner_metadata
import json as _runner_json
_runner_json.dumps(sorted({
    f"{dist.metadata.get('Name', 'unknown')}=={dist.version}"
    for dist in _runner_metadata.distributions()
}))
\`);
  return JSON.parse(String(json));
}

function resetDataDirectory(pyodide) {
  pyodide.runPython(\`
import os as _runner_os
import shutil as _runner_shutil
_runner_shutil.rmtree("/mnt/data", ignore_errors=True)
_runner_os.makedirs("/mnt/data/inputs", exist_ok=True)
_runner_os.makedirs("/mnt/data/outputs", exist_ok=True)
\`);
}

function mountInputs(pyodide, inputs) {
  for (const input of inputs) {
    const fullPath = INPUTS + "/" + input.path;
    const parentPath = fullPath.slice(0, fullPath.lastIndexOf("/"));
    pyodide.FS.mkdirTree(parentPath);
    pyodide.FS.writeFile(fullPath, new Uint8Array(input.data));
  }
}

async function installPackages(pyodide, code, packages) {
  const before = new Set(packageList(pyodide));
  await pyodide.loadPackagesFromImports(code);
  if (packages.length) {
    await pyodide.loadPackage("micropip");
    pyodide.globals.set("_runner_packages", packages);
    try {
      await pyodide.runPythonAsync(\`
import micropip as _runner_micropip
await _runner_micropip.install(list(_runner_packages))
\`);
    } finally {
      pyodide.globals.delete("_runner_packages");
    }
  }
  return packageList(pyodide).filter((item) => !before.has(item));
}

function formatFinalValue(value) {
  if (value === null || value === undefined) return null;
  try { return String(value); } catch { return "[unrepresentable value]"; }
  finally { if (value && typeof value.destroy === "function") value.destroy(); }
}

function captureFigures(pyodide) {
  pyodide.runPython(\`
import os as _runner_os
import sys as _runner_sys
if "matplotlib.pyplot" in _runner_sys.modules:
    _runner_plt = _runner_sys.modules["matplotlib.pyplot"]
    _runner_existing = sum(len(files) for _, _, files in _runner_os.walk("/mnt/data/outputs"))
    for _runner_number in _runner_plt.get_fignums()[:max(0, ${PYTHON_MAX_OUTPUTS} - _runner_existing)]:
        _runner_path = f"/mnt/data/outputs/plot-{_runner_number}.png"
        _runner_suffix = 2
        while _runner_os.path.exists(_runner_path):
            _runner_path = f"/mnt/data/outputs/plot-{_runner_number}-{_runner_suffix}.png"
            _runner_suffix += 1
        _runner_plt.figure(_runner_number).savefig(_runner_path, format="png", bbox_inches="tight")
\`);
}

function outputMetadata(pyodide) {
  return JSON.parse(String(pyodide.runPython(\`
import json as _runner_json
import os as _runner_os
_runner_json.dumps(sorted([
    {"path": _runner_os.path.relpath(_runner_os.path.join(root, name), "/mnt/data/outputs"),
     "size": _runner_os.path.getsize(_runner_os.path.join(root, name))}
    for root, _, files in _runner_os.walk("/mnt/data/outputs")
    for name in files
]))
\`)));
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", csv: "text/csv",
  tsv: "text/tab-separated-values", json: "application/json", txt: "text/plain",
  pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip" };

function collectOutputs(pyodide) {
  const metadata = outputMetadata(pyodide);
  if (metadata.length > MAX_OUTPUTS) throw new Error("Python created more than 5 output files.");
  return metadata.map(({ path, size }) => {
    if (!safePath(path) || !Number.isInteger(size) || size < 1 || size > MAX_OUTPUT_BYTES) {
      throw new Error(\`Python output \${path} exceeds the 10 MB per-file limit or has an invalid path.\`);
    }
    const bytes = pyodide.FS.readFile(OUTPUTS + "/" + path);
    const data = bytes.slice().buffer;
    const extension = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
    return { path, mimeType: MIME[extension] || "application/octet-stream", sizeBytes: data.byteLength, data };
  });
}

async function execute(message) {
  const started = performance.now();
  const { requestId, payload } = message;
  const stdout = [];
  const stderr = [];
  let finalValue = null;
  let error = null;
  let outputs = [];
  let resolvedPackages = [];
  try {
    phase(requestId, "loading");
    const pyodide = await pyodidePromise;
    pyodide.setStdout({ batched: limitedWriter(stdout) });
    pyodide.setStderr({ batched: limitedWriter(stderr) });
    phase(requestId, "mounting");
    resetDataDirectory(pyodide);
    mountInputs(pyodide, payload.inputs);
    phase(requestId, "installing");
    resolvedPackages = await installPackages(pyodide, payload.code, payload.packages);
    phase(requestId, "executing");
    try {
      finalValue = formatFinalValue(await pyodide.runPythonAsync(payload.code));
    } catch (runError) {
      error = runError instanceof Error ? runError.message : String(runError);
    }
    phase(requestId, "collecting");
    try {
      captureFigures(pyodide);
      outputs = collectOutputs(pyodide);
    } catch (outputError) {
      const message = outputError instanceof Error ? outputError.message : String(outputError);
      error = error ? error + "\\n" + message : message;
      outputs = [];
    }
  } catch (setupError) {
    error = setupError instanceof Error ? setupError.message : String(setupError);
  }
  const result = { stdout: stdout.join(""), stderr: stderr.join(""), finalValue, error, outputs,
    resolvedPackages, durationMs: Math.max(0, performance.now() - started) };
  send("result", requestId, result, outputs.map((output) => output.data));
}

self.addEventListener("message", async (event) => {
  if (!validRun(event.data)) return;
  if (running) {
    send("bridge-error", event.data.requestId, { message: "The Python worker is already running." });
    return;
  }
  running = true;
  try { await execute(event.data); }
  finally { running = false; }
});
`;
}
