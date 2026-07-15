const MAX_TITLE_LENGTH = 52;

export function titleFromMessage(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();

  if (!normalized) return "New chat";
  if (normalized.length <= MAX_TITLE_LENGTH) return normalized;

  const shortened = normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd();
  const lastSpace = shortened.lastIndexOf(" ");
  const clean = lastSpace > 32 ? shortened.slice(0, lastSpace) : shortened;
  return `${clean}…`;
}
