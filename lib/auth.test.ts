import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./auth";

describe("single-user allowlist", () => {
  it("accepts only the configured address", () => {
    expect(isAllowedEmail("ERHOLOVACHUK@GMAIL.COM")).toBe(true);
    expect(isAllowedEmail("someone@example.com")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });
});
