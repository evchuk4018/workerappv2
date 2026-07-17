import {
  DEFAULT_MEMORY_SETTINGS,
  type MemorySettings,
  type MemoryWriteMode,
} from "./types";

export function memorySettingsFromRow(row: {
  saved_memory_enabled?: boolean;
  previous_conversations_enabled?: boolean;
  inferred_memory_enabled?: boolean;
  memory_write_mode?: string;
} | null | undefined): MemorySettings {
  return {
    savedMemoryEnabled: row?.saved_memory_enabled ?? DEFAULT_MEMORY_SETTINGS.savedMemoryEnabled,
    previousConversationsEnabled:
      row?.previous_conversations_enabled ?? DEFAULT_MEMORY_SETTINGS.previousConversationsEnabled,
    inferredMemoryEnabled:
      row?.inferred_memory_enabled ?? DEFAULT_MEMORY_SETTINGS.inferredMemoryEnabled,
    writeMode: row?.memory_write_mode === "read_only" ? "read_only" : "read_write",
  };
}

export function parseMemorySettings(value: unknown): MemorySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Memory settings are required.");
  }
  const input = value as Record<string, unknown>;
  const booleanKeys = [
    "savedMemoryEnabled",
    "previousConversationsEnabled",
    "inferredMemoryEnabled",
  ] as const;
  for (const key of booleanKeys) {
    if (typeof input[key] !== "boolean") throw new TypeError(`Invalid ${key}.`);
  }
  if (input.writeMode !== "read_write" && input.writeMode !== "read_only") {
    throw new TypeError("Invalid memory write mode.");
  }
  return {
    savedMemoryEnabled: input.savedMemoryEnabled as boolean,
    previousConversationsEnabled: input.previousConversationsEnabled as boolean,
    inferredMemoryEnabled: input.inferredMemoryEnabled as boolean,
    writeMode: input.writeMode as MemoryWriteMode,
  };
}

export function memorySettingsToRow(settings: MemorySettings) {
  return {
    saved_memory_enabled: settings.savedMemoryEnabled,
    previous_conversations_enabled: settings.previousConversationsEnabled,
    inferred_memory_enabled: settings.inferredMemoryEnabled,
    memory_write_mode: settings.writeMode,
  };
}

