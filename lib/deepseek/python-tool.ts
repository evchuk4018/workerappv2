const MAX_CODE_LENGTH = 50_000;
const MAX_PACKAGES = 10;
const MAX_INPUT_FILES = 20;
const PACKAGE_PATTERN = /^[a-zA-Z0-9_.-]+(?:\[[a-zA-Z0-9_,.-]+\])?(?:==[a-zA-Z0-9_.+!-]+)?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PythonToolRequest {
  callId: string;
  code: string;
  packages: string[];
  inputFileIds: string[];
}

export interface PythonArtifactResult {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PythonToolResult {
  stdout: string;
  stderr: string;
  value: string | null;
  error: string | null;
  durationMs: number;
  resolvedPackages: string[];
  artifacts: PythonArtifactResult[];
}

export const PYTHON_TOOL = {
  type: "function",
  function: {
    name: "run_python",
    description: [
      "Run Python in an isolated browser Pyodide environment to verify calculations, analyze attached data, and create plots or files.",
      "Use one Python call at a time and print compact evidence for every conclusion.",
      "Inputs are mounted in /mnt/data/inputs and outputs must be written to /mnt/data/outputs.",
      "Network requests are allowed only when the destination permits browser CORS.",
      "Only pure-Python or Pyodide-compatible WebAssembly packages can be installed.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Complete Python code, at most 50,000 characters." },
        packages: {
          type: "array",
          items: { type: "string" },
          maxItems: MAX_PACKAGES,
          description: "Optional Pyodide/PyPI packages. Pin versions with == when known.",
        },
        input_file_ids: {
          type: "array",
          items: { type: "string" },
          maxItems: MAX_INPUT_FILES,
          description: "IDs from the attached-file manifest that the code needs.",
        },
      },
      required: ["code", "packages", "input_file_ids"],
      additionalProperties: false,
    },
  },
} as const;

function parseObject(value: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new TypeError("DeepSeek produced invalid Python tool arguments."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Python tool arguments must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown, limit: number, label: string) {
  if (!Array.isArray(value) || value.length > limit || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${label} must be an array of at most ${limit} strings.`);
  }
  return [...new Set(value.map((item) => (item as string).trim()).filter(Boolean))];
}

export function parsePythonToolRequest(callId: string, argumentsJson: string): PythonToolRequest {
  const args = parseObject(argumentsJson);
  const code = typeof args.code === "string" ? args.code.trim() : "";
  if (!code || code.length > MAX_CODE_LENGTH) {
    throw new TypeError(`Python code must contain 1-${MAX_CODE_LENGTH} characters.`);
  }

  const packages = stringArray(args.packages, MAX_PACKAGES, "packages");
  if (packages.some((item) => !PACKAGE_PATTERN.test(item))) {
    throw new TypeError("Python packages must use package, package[extra], or package==version syntax.");
  }
  const inputFileIds = stringArray(args.input_file_ids, MAX_INPUT_FILES, "input_file_ids");
  if (inputFileIds.some((item) => !UUID_PATTERN.test(item))) {
    throw new TypeError("Python input file IDs must be UUIDs from the attachment manifest.");
  }
  return { callId, code, packages, inputFileIds };
}

export function pythonResultContent(result: PythonToolResult) {
  return JSON.stringify({
    stdout: result.stdout.slice(0, 30_000),
    stderr: result.stderr.slice(0, 20_000),
    value: result.value?.slice(0, 10_000) ?? null,
    error: result.error?.slice(0, 20_000) ?? null,
    duration_ms: Math.max(0, Math.round(result.durationMs)),
    resolved_packages: result.resolvedPackages,
    artifacts: result.artifacts,
  });
}
