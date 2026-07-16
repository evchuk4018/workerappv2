export type Fetcher = typeof fetch;

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

export function parseApiKeys(value: string | undefined) {
  return [...new Set((value ?? "").split(",").map((key) => key.trim()).filter(Boolean))];
}

export function isRetryableStatus(status: number) {
  return [401, 402, 403, 408, 425, 429].includes(status) || status >= 500;
}

export class ProviderKeyPool {
  private readonly unavailable = new Set<number>();

  constructor(private readonly keys: readonly string[]) {}

  get configured() {
    return this.keys.length > 0;
  }

  async run<T>(operation: (key: string) => Promise<T>): Promise<T> {
    let lastError: unknown = null;

    for (let index = 0; index < this.keys.length; index += 1) {
      if (this.unavailable.has(index)) continue;
      try {
        return await operation(this.keys[index]);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
        const retryable = caught instanceof ProviderRequestError ? caught.retryable : true;
        if (!retryable) throw caught;
        this.unavailable.add(index);
        lastError = caught;
      }
    }

    throw lastError ?? new ProviderRequestError("No API keys are configured.", true);
  }
}

export async function readJsonResponse(response: Response) {
  if (!response.ok) {
    let retryable = isRetryableStatus(response.status);
    if (!retryable && response.status === 400) {
      const detail = await response.text().catch(() => "");
      retryable = /billing|credit|payment|plan|quota|subscription|usage.?limit/i
        .test(detail.slice(0, 4_000));
    }
    throw new ProviderRequestError(
      `Provider returned ${response.status}.`,
      retryable,
      response.status,
    );
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new ProviderRequestError("Provider returned malformed JSON.", true);
  }
}

export function requestSignal(parent: AbortSignal, timeoutMs: number) {
  return AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)]);
}
