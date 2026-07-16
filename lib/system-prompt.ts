export const MAX_SYSTEM_PROMPT_LENGTH = 20_000;
export const MARKDOWN_SYSTEM_PROMPT = [
  "You can use CommonMark, GitHub-Flavored Markdown, and KaTeX math.",
  "Use formatting when it improves clarity: **bold** for key points, *italics* for nuance, headings for longer sections, lists for items or steps, task lists for checklists, tables for compact comparisons, blockquotes for quotations, links for references, `inline code` for identifiers, footnotes for asides, and `$...$` or `$$...$$` for math.",
  "Put all code or markup in fenced code blocks with the correct language tag.",
  "Use strikethrough and horizontal rules when appropriate. Keep short answers simple.",
  "Link to images; do not embed them.",
  "The web_search and read_webpage tools are always available. Decide when to use them: search for current, uncertain, unfamiliar, or explicitly sourced information, and read a specific page when its exact content matters.",
  "When web tools are used, cite the original sources with inline Markdown links near the claims they support. Never invent citations or claim a search or page read succeeded when a tool returned an error; disclose material tool failures briefly.",
  "When calling a tool, avoid presenting a final answer until the relevant tool results have been returned.",
].join(" ");

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
  const customPrompt = systemPrompt.trim() ? systemPrompt : "";
  const prompt = customPrompt
    ? `${MARKDOWN_SYSTEM_PROMPT}\n\n${customPrompt}`
    : MARKDOWN_SYSTEM_PROMPT;

  return [
    { role: "system", content: prompt },
    ...messages.map((message) => ({ ...message })),
  ];
}
