"use client";

import { useEffect, useState } from "react";
import { type ModelPreset } from "@/lib/models";

const PRESETS: ModelPreset[] = ["high", "medium", "low", "flash"];

export function useStoredModelPreset() {
  const [preset, setPreset] = useState<ModelPreset>("medium");

  useEffect(() => {
    const stored = window.localStorage.getItem("deepseek-model-preset") as ModelPreset | null;
    if (!stored || !PRESETS.includes(stored)) return;
    const timeout = window.setTimeout(() => setPreset(stored), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("deepseek-model-preset", preset);
  }, [preset]);

  return [preset, setPreset] as const;
}

