import type { ChatFile, ChatMessage } from "./types";

export interface StoredChatFile {
  id: string;
  message_id: string | null;
  kind: "input" | "artifact";
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function view(file: StoredChatFile): ChatFile {
  return {
    id: file.id, name: file.original_name, mime_type: file.mime_type,
    size_bytes: file.size_bytes, created_at: file.created_at,
    download_url: `/api/files/${file.id}/content?download=1`,
    ...((file.mime_type === "image/png" || file.mime_type === "image/jpeg")
      ? { preview_url: `/api/files/${file.id}/content` }
      : {}),
  };
}

export function attachFilesToMessages(messages: ChatMessage[], files: StoredChatFile[]) {
  const byMessage = new Map<string, ChatFile[]>();
  for (const file of files) {
    if (!file.message_id || file.kind !== "input") continue;
    byMessage.set(file.message_id, [...(byMessage.get(file.message_id) ?? []), view(file)]);
  }
  return messages.map((message) => ({
    ...message,
    attachments: byMessage.get(message.id) ?? [],
    tool_activity: message.tool_activity.map((activity) => activity.kind !== "python"
      ? activity
      : {
          ...activity,
          artifacts: activity.artifacts.map((artifact) => {
            const file = files.find((candidate) => candidate.id === artifact.id);
            return file ? { ...artifact, ...view(file) } : artifact;
          }),
        }),
  }));
}
