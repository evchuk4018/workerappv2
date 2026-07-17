import { describe, expect, it } from "vitest";
import { applyStreamEvent } from "./stream-event";
import type { ChatMessage, ConversationSummary } from "@/lib/types";

describe("title stream events", () => {
  it("replaces the matching sidebar title", () => {
    let conversations: ConversationSummary[] = [{
      id: "conversation-1",
      title: "Fallback title",
      memory_mode: "normal",
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
      reasoning_blocks: [],
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
        reasoningBlocks: [],
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

describe("reasoning stream events", () => {
  it("keeps reasoning rounds separate while preserving flattened reasoning", () => {
    let messages: ChatMessage[] = [{
      id: "assistant-1",
      conversation_id: "conversation-1",
      role: "assistant",
      content: "",
      reasoning_content: "",
      reasoning_blocks: [],
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
        reasoningBlocks: [],
        activities: [],
        startedAt: Date.now(),
      },
    };
    const context = {
      generationRef,
      setMessages: ((update: (items: ChatMessage[]) => ChatMessage[]) => {
        messages = update(messages);
      }) as never,
      setActiveConversationId: (() => undefined) as never,
      setConversations: (() => undefined) as never,
      setError: (() => undefined) as never,
    };
    const ids = { user: "user-1", assistant: "assistant-1" };

    applyStreamEvent({ type: "reasoning_delta", roundIndex: 0, delta: "First" }, ids, null, context);
    applyStreamEvent({
      type: "reasoning_round_complete",
      roundIndex: 0,
      durationMs: 1200,
    }, ids, null, context);
    applyStreamEvent({ type: "reasoning_delta", roundIndex: 1, delta: "Second" }, ids, null, context);

    expect(messages[0].reasoning_content).toBe("FirstSecond");
    expect(messages[0].reasoning_blocks).toEqual([
      { round_index: 0, content: "First", duration_ms: 1200 },
      { round_index: 1, content: "Second", duration_ms: null },
    ]);
    expect(generationRef.current.reasoningBlocks).toEqual(messages[0].reasoning_blocks);
  });
});
