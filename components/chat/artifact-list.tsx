import { Download, File, FileArchive, FileImage, FileSpreadsheet } from "lucide-react";
import type { PythonArtifact } from "@/lib/tool-activity";

function safeArtifactUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function ArtifactIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <FileImage size={17} />;
  if (mimeType.includes("spreadsheet") || mimeType === "text/csv") {
    return <FileSpreadsheet size={17} />;
  }
  if (mimeType === "application/zip") return <FileArchive size={17} />;
  return <File size={17} />;
}

export function ArtifactList({ artifacts }: { artifacts: PythonArtifact[] }) {
  if (!artifacts.length) return null;

  return (
    <div className="artifact-list" aria-label="Generated files">
      {artifacts.map((artifact) => {
        const downloadUrl = safeArtifactUrl(artifact.download_url);
        const previewUrl = artifact.mime_type.startsWith("image/")
          ? safeArtifactUrl(artifact.preview_url || artifact.download_url)
          : null;
        return (
          <article className="artifact-card" key={artifact.id}>
            {previewUrl && (
              <a className="artifact-preview" href={downloadUrl || previewUrl} target="_blank" rel="noreferrer">
                {/* The URL is restricted to generated image artifacts. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={`Preview of ${artifact.name}`} />
              </a>
            )}
            <div className="artifact-meta">
              <ArtifactIcon mimeType={artifact.mime_type} />
              <span>
                <strong>{artifact.name}</strong>
                <small>{formatFileSize(artifact.size_bytes)}</small>
              </span>
              {downloadUrl ? (
                <a href={downloadUrl} download={artifact.name} aria-label={`Download ${artifact.name}`}>
                  <Download size={16} />
                </a>
              ) : (
                <span className="artifact-unavailable" title="Download link unavailable">
                  <Download size={16} />
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
