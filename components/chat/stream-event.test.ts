import { describe, expect, it } from "vitest";
import { applyStreamEvent } from "./stream-event";
import type { ChatMessage, ConversationSummary } from "@/lib/types";

describe("title stream events", () => {
  it("replaces the matching sidebar title", () => {
    let conversations: ConversationSummary[] = [{
      id: "conversation-1",
      title: "Fallback title",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }];
    const setConversations = (update: unknown) => {
      conversations = typeof update === "function"
        ? (update as (items: ConversationSummary[]) => ConversationSummary[])(conversations)
        : update as ConversationSummary[];
    };

    applyStreamEvent(
      { type: "title", conversationId: "conversation-1", title: "Generated title" },
      { user: "user-1", assistant: "assistant-1" },
      "conversation-1",
      {
        generationRef: { current: null },
        setMessages: (() => undefined) as never,
        setActiveConversationId: (() => undefined) as never,
        setConversations: setConversations as never,
        setError: (() => undefined) as never,
      },
    );

    expect(conversations[0].title).toBe("Generated title");
  });
});

describe("tool activity stream events", () => {
  it("upserts activity into the current generation and rendered message", () => {
    let messages: ChatMessage[] = [{
      id: "assistant-1",
      conversation_id: "conversation-1",
      role: "assistant",
      content: "",
      reasoning_content: "",
      tool_activity: [],
      model_preset: "medium",
      status: "streaming",
      duration_ms: null,
      created_at: "2026-01-01T00:00:00.000Z",
    }];
    const generationRef = {
      current: {
        controller: new AbortController(),
        assistantId: "assistant-1",
        content: "",
        reasoning: "",
        activities: [],
        startedAt: Date.now(),
      },
    };

    applyStreamEvent(
      {
        type: "tool_activity",
        activity: {
          id: "search-1",
          kind: "search",
          provider: "brave",
          status: "running",
          query: "current answer",
          sources: [],
          started_at: "2026-01-01T00:00:01.000Z",
        },
      },
      { user: "user-1", assistant: "assistant-1" },
      "conversation-1",
      {
        generationRef,
        setMessages: ((update: (items: ChatMessage[]) => ChatMessage[]) => {
          messages = update(messages);
        }) as never,
        setActiveConversationId: (() => undefined) as never,
        setConversations: (() => undefined) as never,
        setError: (() => undefined) as never,
      },
    );

    expect(messages[0].tool_activity).toHaveLength(1);
    expect(generationRef.current.activities[0]).toMatchObject({ id: "search-1", status: "running" });
  });
});
