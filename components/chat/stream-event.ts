import type { Dispatch, SetStateAction } from "react";
import type { StreamEvent } from "@/lib/streaming";
import type { ChatMessage, ConversationSummary } from "@/lib/types";
import { type ToolActivity, upsertToolActivity } from "@/lib/tool-activity";

export interface CurrentGeneration {
  controller: AbortController;
  assistantId: string;
  content: string;
  reasoning: string;
  activities: ToolActivity[];
  startedAt: number;
}

interface StreamIds {
  user: string;
  assistant: string;
}

interface StreamContext {
  generationRef: { current: CurrentGeneration | null };
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setConversations: Dispatch<SetStateAction<ConversationSummary[]>>;
  setError: Dispatch<SetStateAction<string>>;
}

function updateMessage(
  setMessages: StreamContext["setMessages"],
  id: string,
  update: Partial<ChatMessage>,
) {
  setMessages((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
}

export function replaceConversationTitle(
  conversations: ConversationSummary[],
  conversationId: string,
  title: string,
) {
  return conversations.map((conversation) => conversation.id === conversationId
    ? { ...conversation, title }
    : conversation);
}

export function applyStreamEvent(
  event: StreamEvent,
  ids: StreamIds,
  requestConversationId: string | null,
  context: StreamContext,
) {
  if (event.type === "meta") {
    const previousUserId = ids.user;
    const previousAssistantId = ids.assistant;
    ids.user = event.userMessageId;
    ids.assistant = event.assistantMessageId;
    if (context.generationRef.current) {
      context.generationRef.current.assistantId = event.assistantMessageId;
    }

    context.setMessages((current) => current.map((item) => {
      if (item.id === previousUserId) {
        return { ...item, id: event.userMessageId, conversation_id: event.conversationId };
      }
      if (item.id === previousAssistantId) {
        return { ...item, id: event.assistantMessageId, conversation_id: event.conversationId };
      }
      return item;
    }));
    context.setActiveConversationId(event.conversationId);
    const now = new Date().toISOString();
    context.setConversations((current) => [
      {
        id: event.conversationId,
        title: event.title,
        created_at: now,
        updated_at: now,
      },
      ...current.filter((item) => item.id !== event.conversationId),
    ]);
    if (!requestConversationId) {
      window.history.replaceState(
        { conversationId: event.conversationId },
        "",
        `/c/${event.conversationId}`,
      );
    }
    return;
  }

  if (event.type === "reasoning_delta") {
    if (context.generationRef.current) context.generationRef.current.reasoning += event.delta;
    context.setMessages((current) => current.map((item) => item.id === ids.assistant
      ? { ...item, reasoning_content: `${item.reasoning_content ?? ""}${event.delta}` }
      : item));
    return;
  }

  if (event.type === "content_delta") {
    if (context.generationRef.current) context.generationRef.current.content += event.delta;
    context.setMessages((current) => current.map((item) => item.id === ids.assistant
      ? { ...item, content: `${item.content}${event.delta}` }
      : item));
    return;
  }

  if (event.type === "tool_activity") {
    if (context.generationRef.current) {
      context.generationRef.current.activities = upsertToolActivity(
        context.generationRef.current.activities,
        event.activity,
      );
    }
    context.setMessages((current) => current.map((item) => item.id === ids.assistant
      ? { ...item, tool_activity: upsertToolActivity(item.tool_activity, event.activity) }
      : item));
    return;
  }

  if (event.type === "title") {
    context.setConversations((current) => replaceConversationTitle(
      current,
      event.conversationId,
      event.title,
    ));
    return;
  }

  if (event.type === "done") {
    updateMessage(context.setMessages, ids.assistant, {
      status: event.status,
      duration_ms: event.durationMs,
    });
    return;
  }

  context.setError(event.message);
  updateMessage(context.setMessages, ids.assistant, { status: "error" });
}
