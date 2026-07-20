export const PYODIDE_VERSION = "0.28.3" as const;
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
export const PYODIDE_MODULE_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;

export const PYTHON_PROTOCOL_CHANNEL = "workerapp-python" as const;
export const PYTHON_PROTOCOL_VERSION = 1 as const;
export const PYTHON_INPUT_ROOT = "/mnt/data/inputs" as const;
export const PYTHON_OUTPUT_ROOT = "/mnt/data/outputs" as const;

export const PYTHON_EXECUTION_TIMEOUT_MS = 30_000;
export const PYTHON_PREPARATION_TIMEOUT_MS = 120_000;
export const PYTHON_MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const PYTHON_MAX_OUTPUTS = 5;
export const PYTHON_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
