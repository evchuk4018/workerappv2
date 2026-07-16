import { describe, expect, it } from "vitest";
import { parsePublicUrl } from "./public-url";

describe("public webpage URL validation", () => {
  it("accepts ordinary public HTTP and HTTPS URLs", () => {
    expect(parsePublicUrl("https://www.reddit.com/r/typescript/comments/abc").hostname)
      .toBe("www.reddit.com");
    expect(parsePublicUrl("http://example.com/path").protocol).toBe("http:");
  });

  it.each([
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1/private",
    "http://[::1]/private",
    "http://[::ffff:127.0.0.1]/private",
    "https://user:password@example.com",
    "https://service.internal/path",
  ])("rejects non-public URL %s", (url) => {
    expect(() => parsePublicUrl(url)).toThrow();
  });
});
