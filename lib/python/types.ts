export type BrowserPythonPhase =
  | "loading"
  | "mounting"
  | "installing"
  | "executing"
  | "collecting";

export type BrowserPythonInput = {
  path: string;
  data: ArrayBuffer | Uint8Array;
  mimeType?: string;
};

export type BrowserPythonRunRequest = {
  code: string;
  packages?: string[];
  inputs?: BrowserPythonInput[];
};

export type BrowserPythonOutput = {
  path: string;
  mimeType: string;
  sizeBytes: number;
  data: ArrayBuffer;
};

export type BrowserPythonRunResult = {
  stdout: string;
  stderr: string;
  finalValue: string | null;
  error: string | null;
  outputs: BrowserPythonOutput[];
  resolvedPackages: string[];
  durationMs: number;
};

export type BrowserPythonProgress = {
  phase: BrowserPythonPhase;
};

export type BrowserPythonRunnerErrorCode =
  | "busy"
  | "disposed"
  | "protocol"
  | "reset"
  | "timeout"
  | "unavailable"
  | "validation";

export class BrowserPythonRunnerError extends Error {
  constructor(
    public readonly code: BrowserPythonRunnerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BrowserPythonRunnerError";
  }
}

export type BrowserPythonRunner = {
  run(
    request: BrowserPythonRunRequest,
    onProgress?: (progress: BrowserPythonProgress) => void,
  ): Promise<BrowserPythonRunResult>;
  reset(): void;
  dispose(): void;
};
