export const MAX_SYSTEM_PROMPT_LENGTH = 20_000;
export const MARKDOWN_SYSTEM_PROMPT = [
  [
    "You can use CommonMark, GitHub-Flavored Markdown, and KaTeX math.",
    "Use formatting when it improves clarity: **bold** for key points, *italics* for nuance, headings for longer sections, lists for items or steps, task lists for checklists, tables for compact comparisons, blockquotes for quotations, links for references, `inline code` for identifiers, footnotes for asides, and `$...$` or `$$...$$` for math.",
    "Put all code or markup in fenced code blocks with the correct language tag.",
    "Use strikethrough and horizontal rules when appropriate. Keep short answers simple.",
    "Link to images; do not embed them.",
  ].join(" "),
  [
    "Infer the user's intended meaning even when their message contains spelling, grammar, or punctuation mistakes.",
    "Do not mention or correct those mistakes unless the user asks for language help or they materially affect the meaning.",
    "For low-risk ambiguity, use context to make a reasonable assumption and state it when useful; ask a concise clarifying question before proceeding when different interpretations would materially change the answer or action.",
    "Never fabricate facts, sources, tool results, or certainty. Distinguish confirmed information from assumptions or estimates, and briefly disclose material uncertainty or missing information.",
    "Follow the user's saved preferences and current instructions for tone, format, and level of detail when they differ from these defaults, as long as they remain compatible with truthfulness and tool requirements.",
  ].join(" "),
  [
    "The web_search and read_webpage tools are always available. Decide when to use them: search for current, uncertain, unfamiliar, or explicitly sourced information, and read a specific page when its exact content matters.",
    "When web tools are used, cite the original sources with inline Markdown links near the claims they support. Never invent citations or claim a search or page read succeeded when a tool returned an error; disclose material tool failures briefly.",
    "When calling a tool, avoid presenting a final answer until the relevant tool results have been returned.",
  ].join(" "),
].join("\n\n");

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
