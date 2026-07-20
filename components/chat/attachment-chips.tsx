import { CircleAlert, File, LoaderCircle, X } from "lucide-react";
import { formatFileSize } from "./artifact-list";

export type AttachmentState = "queued" | "uploading" | "ready" | "error";

export interface AttachmentItem {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at?: string;
  download_url?: string;
  state?: AttachmentState;
  error?: string;
}

export function AttachmentChips({
  attachments,
  onRemove,
  disabled = false,
}: {
  attachments: AttachmentItem[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className="attachment-chips" aria-label="Attachments">
      {attachments.map((attachment) => (
        <div className={`attachment-chip attachment-${attachment.state ?? "ready"}`} key={attachment.id}>
          {attachment.state === "uploading" ? (
            <LoaderCircle className="tool-spinner" size={16} />
          ) : attachment.state === "error" ? (
            <CircleAlert size={16} />
          ) : <File size={16} />}
          <span>
            {attachment.download_url?.startsWith("/api/files/")
              ? <a href={attachment.download_url}><strong>{attachment.name}</strong></a>
              : <strong>{attachment.name}</strong>}
            <small>{attachment.error || formatFileSize(attachment.size_bytes)}</small>
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(attachment.id)}
              disabled={disabled}
              aria-label={`Remove ${attachment.name}`}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
