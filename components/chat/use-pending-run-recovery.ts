"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { CurrentGeneration } from "./stream-event";
import type { ChatMessage } from "@/lib/types";

interface RecoveryRunner {
  resume(runId: string, ids: { user: string; assistant: string }, conversationId: string): Promise<void>;
}

interface RecoveryOptions {
  conversationId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  runner: RecoveryRunner;
  startGeneration: (generation: CurrentGeneration) => void;
  finishGeneration: (controller: AbortController) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  onSettled: () => void;
}

export function usePendingRunRecovery(options: RecoveryOptions) {
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    const assistant = [...options.messages].reverse().find((message) =>
      message.role === "assistant"
      && (message.status === "awaiting_tool" || message.status === "streaming"));
    if (!options.conversationId || !assistant || options.isStreaming) return;
    const key = `${options.conversationId}:${assistant.id}`;
    if (attempted.current === key) return;
    attempted.current = key;

    const controller = new AbortController();
    options.startGeneration({
      controller, assistantId: assistant.id, content: assistant.content,
      reasoning: assistant.reasoning_content ?? "", reasoningBlocks: assistant.reasoning_blocks,
      activities: assistant.tool_activity,
      startedAt: Date.now() - (assistant.duration_ms ?? 0),
    });
    options.setIsStreaming(true);
    options.setError("");

    void (async () => {
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const response = await fetch(
              `/api/chat/pending?conversationId=${encodeURIComponent(options.conversationId!)}`
                + `&assistantMessageId=${encodeURIComponent(assistant.id)}`,
              { signal: controller.signal },
            );
            if (!response.ok) throw new Error("Unable to inspect the interrupted run.");
            const body = await response.json() as {
              run: { id: string; status: string; assistant_message_id: string | null } | null;
            };
            if (!body.run || body.run.assistant_message_id !== assistant.id) return;
            options.setError("");
            await options.runner.resume(
              body.run.id,
              { user: "", assistant: assistant.id },
              options.conversationId!,
            );
            return;
          } catch (caught) {
            if (controller.signal.aborted) throw caught;
            if (attempt === 3) options.setError("Connection interrupted; still trying to recover the response.");
            await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1_000 * 2 ** attempt)));
          }
        }
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          options.setError(caught instanceof Error ? caught.message : "Unable to resume Python.");
          options.setMessages((current) => current.map((message) => message.id === assistant.id
            ? { ...message, status: "error" }
            : message));
        }
      } finally {
        options.finishGeneration(controller);
        options.onSettled();
      }
    })();
    return () => controller.abort();
    // Recovery runs once per active assistant message; streaming state changes are handled internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.conversationId]);
}
