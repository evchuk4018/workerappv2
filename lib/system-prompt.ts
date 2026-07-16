export const MAX_SYSTEM_PROMPT_LENGTH = 20_000;
export const SYSTEM_PROMPT_INTERVAL = 5;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function normalizeSystemPrompt(value: string): string {
  if (value.length > MAX_SYSTEM_PROMPT_LENGTH) {
    throw new RangeError(`System prompts cannot exceed ${MAX_SYSTEM_PROMPT_LENGTH} characters.`);
  }
  return value.trim() ? value : "";
}

export function buildProviderMessages(
  messages: readonly ConversationMessage[],
  systemPrompt: string,
): ProviderMessage[] {
  const prompt = systemPrompt.trim() ? systemPrompt : "";
  if (!prompt) return messages.map((message) => ({ ...message }));

  const result: ProviderMessage[] = [];
  let userTurns = 0;

  for (const message of messages) {
    if (message.role === "user") {
      if (userTurns % SYSTEM_PROMPT_INTERVAL === 0) {
        result.push({ role: "system", content: prompt });
      }
      userTurns += 1;
    }
    result.push({ ...message });
  }

  return result;
}
