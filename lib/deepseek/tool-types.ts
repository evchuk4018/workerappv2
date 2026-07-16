export interface AgentToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: AgentToolCall[];
    }
  | { role: "tool"; content: string; tool_call_id: string };

export const WEB_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web with Brave and return relevant source links and extracted chunks. Use for current, uncertain, or explicitly sourced information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A concise web search query, at most 50 words." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_webpage",
      description: "Read a specific public webpage with Tavily and return clean Markdown. Use when the exact page matters after finding or receiving a URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The absolute public HTTP(S) URL to read." },
          focus: { type: "string", description: "What information to focus on if the page is too large." },
        },
        required: ["url", "focus"],
        additionalProperties: false,
      },
    },
  },
] as const;
