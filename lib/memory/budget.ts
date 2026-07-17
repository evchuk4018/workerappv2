import type { ConversationMessage } from "@/lib/system-prompt";

export const PROFILE_TOKEN_BUDGET = 600;
export const PINNED_TOKEN_BUDGET = 400;
export const ATOMIC_TOKEN_BUDGET = 700;
export const SUMMARY_TOKEN_BUDGET = 300;
export const TOTAL_MEMORY_TOKEN_BUDGET = 2000;
export const CONVERSATION_TOKEN_BUDGET = 24_000;

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 3);
}

export function trimToTokenBudget(value: string, budget: number): string {
  if (estimateTokens(value) <= budget) return value;
  return `${value.slice(0, Math.max(0, budget * 3 - 1)).trimEnd()}…`;
}

export function takeWithinBudget<T>(
  items: readonly T[],
  budget: number,
  render: (item: T) => string,
): T[] {
  const selected: T[] = [];
  let used = 0;
  for (const item of items) {
    const cost = estimateTokens(render(item));
    if (cost > budget - used) continue;
    selected.push(item);
    used += cost;
  }
  return selected;
}

export function boundConversationMessages(
  messages: readonly ConversationMessage[],
  budget = CONVERSATION_TOKEN_BUDGET,
): ConversationMessage[] {
  const selected: ConversationMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const cost = estimateTokens(message.content) + 4;
    if (selected.length && used + cost > budget) break;
    selected.unshift(message);
    used += cost;
  }
  return selected;
}

