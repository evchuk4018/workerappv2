"use client";
import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { SearchDialog } from "@/components/chat/search-dialog";
import { SettingsDialog } from "@/components/chat/settings-dialog";
import {
  applyStreamEvent,
  replaceConversationTitle,
  type CurrentGeneration,
} from "@/components/chat/stream-event";
import { persistStoppedGeneration } from "@/components/chat/stop-generation";
import { useConversationSearch } from "@/components/chat/use-conversation-search";
import { useStoredModelPreset } from "@/components/chat/use-stored-model-preset";
import { buildOptimisticMessages } from "@/components/chat/optimistic-messages";
import type { MemoryMode } from "@/lib/memory/types";
import { parseNdjsonBuffer, type StreamEvent } from "@/lib/streaming";
import type { ChatMessage, ConversationSummary } from "@/lib/types";
export function ChatApp({
  initialConversations,
  initialConversationId,
  initialMessages,
}: {
  initialConversations: ConversationSummary[];
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [preset, setPreset] = useStoredModelPreset();
  const [memoryMode, setMemoryMode] = useState<MemoryMode>(
    initialConversations.find((item) => item.id === initialConversationId)?.memory_mode ?? "normal",
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const search = useConversationSearch(searchOpen, initialConversations);
  const generationRef = useRef<CurrentGeneration | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(frame);
  }, [messages]);
  async function refreshConversations() {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = (await response.json()) as { conversations: ConversationSummary[] };
      setConversations(data.conversations);
    } catch {
      // Current history remains usable offline.
    }
  }

  async function openConversation(id: string, pushHistory = true) {
    if (isStreaming || id === activeConversationId) {
      setSidebarOpen(false);
      setSearchOpen(false);
      return;
    }
    setLoadingChat(true);
    setError("");
    try {
      const response = await fetch(`/api/conversations/${id}`);
      if (!response.ok) throw new Error("Unable to open this chat.");
      const data = (await response.json()) as {
        conversation: ConversationSummary;
        messages: ChatMessage[];
      };
      setActiveConversationId(id);
      setMemoryMode(data.conversation.memory_mode);
      setMessages(data.messages);
      if (pushHistory) window.history.pushState({ conversationId: id }, "", `/c/${id}`);
      setSidebarOpen(false);
      setSearchOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open this chat.");
    } finally {
      setLoadingChat(false);
    }
  }

  useEffect(() => {
    function handlePopState() {
      const match = window.location.pathname.match(/^\/c\/([^/]+)$/);
      if (match) void openConversation(match[1], false);
      else if (!isStreaming) {
        setActiveConversationId(null);
        setMessages([]);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // openConversation intentionally follows the current component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, activeConversationId]);

  function newChat() {
    if (isStreaming) return;
    setActiveConversationId(null);
    setMessages([]);
    setMemoryMode("normal");
    setInput("");
    setError("");
    setSidebarOpen(false);
    setSearchOpen(false);
    window.history.pushState({}, "", "/");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function updateMessage(id: string, update: Partial<ChatMessage>) {
    setMessages((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  }

  function handleStreamEvent(
    event: StreamEvent,
    ids: { user: string; assistant: string },
    requestConversationId: string | null,
  ) {
    applyStreamEvent(event, ids, requestConversationId, {
      generationRef,
      setMessages,
      setActiveConversationId,
      setConversations,
      setError,
    });
  }

  async function sendMessage() {
    const message = input.trim();
    if (!message || isStreaming) return;

    const requestConversationId = activeConversationId;
    const timestamp = new Date().toISOString();
    const tempUserId = `user-${crypto.randomUUID()}`;
    const tempAssistantId = `assistant-${crypto.randomUUID()}`;
    const ids = { user: tempUserId, assistant: tempAssistantId };
    const controller = new AbortController();

    setMessages((current) => [...current, ...buildOptimisticMessages({
      conversationId: requestConversationId,
      message,
      preset,
      userId: tempUserId,
      assistantId: tempAssistantId,
      timestamp,
    })]);
    setInput("");
    setError("");
    setIsStreaming(true);
    generationRef.current = {
      controller,
      assistantId: tempAssistantId,
      content: "",
      reasoning: "",
      reasoningBlocks: [],
      activities: [],
      startedAt: Date.now(),
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: requestConversationId, message, preset, memoryMode }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error || "Unable to start the response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjsonBuffer(buffer);
        buffer = parsed.remainder;
        parsed.events.forEach((event) => handleStreamEvent(event, ids, requestConversationId));
      }
      if (buffer.trim()) {
        handleStreamEvent(JSON.parse(buffer) as StreamEvent, ids, requestConversationId);
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "The response failed.");
        updateMessage(ids.assistant, { status: "error" });
      }
    } finally {
      if (generationRef.current?.controller === controller) {
        setIsStreaming(false);
        generationRef.current = null;
      }
      void refreshConversations();
    }
  }

  function stopOutput() {
    const generation = generationRef.current;
    if (!generation) return;
    const conversationId = activeConversationId;
    const durationMs = Date.now() - generation.startedAt;
    generation.controller.abort();
    generationRef.current = null;
    updateMessage(generation.assistantId, { status: "stopped", duration_ms: durationMs });
    setIsStreaming(false);

    if (!generation.assistantId.startsWith("assistant-")) {
      void persistStoppedGeneration(generation).then((title) => {
        if (!title || !conversationId) return;
        setConversations((current) => replaceConversationTitle(current, conversationId, title));
      });
    }
  }

  async function toggleMemoryMode() {
    if (isStreaming) return;
    const nextMode: MemoryMode = memoryMode === "normal" ? "off" : "normal";
    if (!activeConversationId) {
      setMemoryMode(nextMode);
      return;
    }
    const response = await fetch(`/api/conversations/${activeConversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryMode: nextMode }),
    });
    if (!response.ok) {
      setError("Unable to update this chat's memory mode.");
      return;
    }
    setMemoryMode(nextMode);
    setConversations((current) => current.map((item) => item.id === activeConversationId
      ? { ...item, memory_mode: nextMode }
      : item));
  }

  return (
    <main className="app-shell">
      <ChatSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        open={sidebarOpen}
        isStreaming={isStreaming}
        settingsButtonRef={settingsButtonRef}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        onSearch={() => { setSearchOpen(true); setSidebarOpen(false); }}
        onSettings={() => { setSettingsOpen(true); setSidebarOpen(false); }}
        onOpenConversation={(id) => void openConversation(id)}
      />
      {sidebarOpen && (
        <button className="sidebar-scrim" type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />
      )}
      <ChatPanel
        messages={messages}
        loadingChat={loadingChat}
        input={input}
        preset={preset}
        memoryMode={memoryMode}
        isStreaming={isStreaming}
        error={error}
        textareaRef={textareaRef}
        bottomRef={bottomRef}
        onInputChange={setInput}
        onPresetChange={setPreset}
        onToggleMemoryMode={() => void toggleMemoryMode()}
        onOpenSidebar={() => setSidebarOpen(true)}
        onSend={() => void sendMessage()}
        onStop={stopOutput}
        onDismissError={() => setError("")}
      />
      {searchOpen && (
        <SearchDialog
          query={search.query}
          results={search.results}
          onQueryChange={search.setQuery}
          onClose={() => setSearchOpen(false)}
          onOpenConversation={(id) => void openConversation(id)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} returnFocusRef={settingsButtonRef} />
      )}
    </main>
  );
}
