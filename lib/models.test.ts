import { describe, expect, it } from "vitest";
import { buildDeepSeekModelOptions, isModelPreset } from "./models";

describe("DeepSeek model presets", () => {
  it("maps High to V4 Pro Max", () => {
    expect(buildDeepSeekModelOptions("high")).toEqual({
      model: "deepseek-v4-pro",
      thinking: { type: "enabled" },
      reasoning_effort: "max",
    });
  });

  it("maps Medium and Low to the supported Flash efforts", () => {
    expect(buildDeepSeekModelOptions("medium")).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning_effort: "max",
    });
    expect(buildDeepSeekModelOptions("low")).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning_effort: "high",
    });
  });

  it("disables reasoning for Flash", () => {
    expect(buildDeepSeekModelOptions("flash")).toEqual({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
    });
  });

  it("validates preset input", () => {
    expect(isModelPreset("medium")).toBe(true);
    expect(isModelPreset("turbo")).toBe(false);
  });
});
