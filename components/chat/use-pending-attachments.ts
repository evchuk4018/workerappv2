"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { AttachmentItem } from "./attachment-chips";
import { validateInputFiles } from "@/lib/chat-files";

export function usePendingAttachments(setError: Dispatch<SetStateAction<string>>) {
  const [entries, setEntries] = useState<Array<{ id: string; file: File }>>([]);
  const items = useMemo(() => entries.map(({ id, file }): AttachmentItem => ({
    id, name: file.name, mime_type: file.type || "application/octet-stream",
    size_bytes: file.size, state: "queued",
  })), [entries]);

  function add(files: File[]) {
    try {
      const next = [...entries.map((item) => item.file), ...files];
      validateInputFiles(next.map((file) => ({
        name: file.name, mimeType: file.type, sizeBytes: file.size,
      })));
      setEntries((current) => [
        ...current,
        ...files.map((file) => ({ id: crypto.randomUUID(), file })),
      ]);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to attach files.");
    }
  }

  return {
    items,
    files: entries.map((entry) => entry.file),
    add,
    remove: (id: string) => setEntries((current) => current.filter((item) => item.id !== id)),
    clear: () => setEntries([]),
  };
}
