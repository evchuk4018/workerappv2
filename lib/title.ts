export const MAX_TITLE_LENGTH = 52;

export function shortenTitle(title: string) {
  if (title.length <= MAX_TITLE_LENGTH) return title;

  const shortened = title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd();
  const lastSpace = shortened.lastIndexOf(" ");
  const clean = lastSpace > 32 ? shortened.slice(0, lastSpace) : shortened;
  return `${clean}…`;
}

export function titleFromMessage(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();

  if (!normalized) return "New chat";
  return shortenTitle(normalized);
}
