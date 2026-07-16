import { describe, expect, it, vi } from "vitest";
import {
  isRetryableStatus,
  parseApiKeys,
  ProviderKeyPool,
  ProviderRequestError,
  readJsonResponse,
} from "./key-failover";

describe("provider key failover", () => {
  it("normalizes comma-separated keys without duplicates", () => {
    expect(parseApiKeys(" first, second,first, ,third ")).toEqual(["first", "second", "third"]);
  });

  it("disables a failed key for the remainder of the response", async () => {
    const operation = vi.fn(async (key: string) => {
      if (key === "bad") throw new ProviderRequestError("rate limited", true, 429);
      return key;
    });
    const pool = new ProviderKeyPool(["bad", "good"]);

    await expect(pool.run(operation)).resolves.toBe("good");
    await expect(pool.run(operation)).resolves.toBe("good");
    expect(operation.mock.calls.map(([key]) => key)).toEqual(["bad", "good", "good"]);
  });

  it("does not rotate keys for invalid requests", async () => {
    const operation = vi.fn(async () => {
      throw new ProviderRequestError("invalid query", false, 400);
    });
    const pool = new ProviderKeyPool(["first", "second"]);

    await expect(pool.run(operation)).rejects.toThrow("invalid query");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("classifies documented transient and quota statuses", () => {
    expect(isRetryableStatus(401)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });

  it("classifies provider billing errors as retryable without exposing details", async () => {
    const response = Response.json(
      { error: "Monthly credit quota exhausted for account secret-account-name" },
      { status: 400 },
    );

    await expect(readJsonResponse(response)).rejects.toMatchObject({
      message: "Provider returned 400.",
      retryable: true,
    });
  });
});
