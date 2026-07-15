export const MODEL_PRESETS = {
  high: {
    label: "High",
    detail: "DeepSeek V4 Pro · Max",
    model: "deepseek-v4-pro",
    thinking: true,
    reasoningEffort: "max",
  },
  medium: {
    label: "Medium",
    detail: "DeepSeek V4 Flash · Max",
    model: "deepseek-v4-flash",
    thinking: true,
    reasoningEffort: "max",
  },
  low: {
    label: "Low",
    detail: "DeepSeek V4 Flash · High",
    model: "deepseek-v4-flash",
    thinking: true,
    reasoningEffort: "high",
  },
  flash: {
    label: "Flash",
    detail: "DeepSeek V4 Flash · Instant",
    model: "deepseek-v4-flash",
    thinking: false,
    reasoningEffort: null,
  },
} as const;

export type ModelPreset = keyof typeof MODEL_PRESETS;

export function isModelPreset(value: unknown): value is ModelPreset {
  return typeof value === "string" && value in MODEL_PRESETS;
}

export function buildDeepSeekModelOptions(preset: ModelPreset) {
  const selected = MODEL_PRESETS[preset];

  return {
    model: selected.model,
    thinking: { type: selected.thinking ? "enabled" : "disabled" },
    ...(selected.reasoningEffort
      ? { reasoning_effort: selected.reasoningEffort }
      : {}),
  };
}
