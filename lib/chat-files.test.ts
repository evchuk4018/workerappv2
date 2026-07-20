import { describe, expect, it } from "vitest";
import { objectPath, safeFileName, validateInputFiles, validateOutputFiles } from "./chat-files";

describe("chat file validation", () => {
  it("sanitizes object names and creates user-owned paths", () => {
    expect(safeFileName("../sales<script>.csv")).toBe("_sales_script_.csv");
    expect(objectPath("user", "chat", "file", "sales data.csv"))
      .toBe("user/chat/file/sales data.csv");
  });

  it("accepts common data inputs and blocks oversized totals", () => {
    expect(validateInputFiles([{ name: "data.csv", mimeType: "text/csv", sizeBytes: 12 }]))
      .toHaveLength(1);
    expect(() => validateInputFiles([{ name: "data.csv", mimeType: "text/csv", sizeBytes: 26 * 1024 * 1024 }]))
      .toThrow(/25 MB/);
  });

  it("rejects active output types", () => {
    expect(() => validateOutputFiles([{ name: "report.html", mimeType: "text/html", sizeBytes: 12 }]))
      .toThrow(/not allowed/);
  });
});
