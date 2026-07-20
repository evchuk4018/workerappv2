"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";

export const DATA_FILE_ACCEPT = [
  ".csv",
  ".tsv",
  ".json",
  ".xlsx",
  ".txt",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
].join(",");

export interface AttachmentPickerProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
}

export function AttachmentPicker({
  onFilesSelected,
  disabled = false,
  accept = DATA_FILE_ACCEPT,
  multiple = true,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className="attachment-picker-button"
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach data files"
        title="Attach data files"
      >
        <Paperclip size={16} />
      </button>
      <input
        className="visually-hidden"
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) onFilesSelected(files);
        }}
      />
    </>
  );
}
