"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Menu,
  MessageSquare,
  Search,
  Sparkles,
  Square,
  SquarePen,
  X,
} from "lucide-react";
import { Message } from "@/components/chat/message";
import { ModelMenu } from "@/components/chat/model-menu";
import { type ModelPreset } from "@/lib/models";
import { parseNdjsonBuffer, type StreamEvent } from "@/lib/streaming";
import type { ChatMessage, ConversationSummary } from "@/lib/types";

interface CurrentGeneration {
  controller: AbortController;
  assistantId: string;
  content: string;
  reasoning: string;
  startedAt: number;
}

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
  const [preset, setPreset] = useState<ModelPreset>("medium");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(initialConversations);
  const [error, setError] = useState("");
  const generationRef = useRef<CurrentGeneration | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("deepseek-model-preset") as ModelPreset | null;
    if (stored && ["high", "medium", "low", "flash"].includes(stored)) {
      const timeout = window.setTimeout(() => setPreset(stored), 0);
      return () => window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("deepseek-model-preset", preset);
  }, [preset]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    if (!searchOpen) return;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/conversations?query=${encodeURIComponent(searchQuery)}`);
        if (!response.ok) return;
        const data = (await response.json()) as { conversations: ConversationSummary[] };
        setSearchResults(data.conversations);
      } catch {
        // Keep the previous results if search is temporarily unavailable.
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [searchOpen, searchQuery]);

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
    if (event.type === "meta") {
      const previousUserId = ids.user;
      const previousAssistantId = ids.assistant;
      ids.user = event.userMessageId;
      ids.assistant = event.assistantMessageId;
      if (generationRef.current) generationRef.current.assistantId = event.assistantMessageId;

      setMessages((current) => current.map((item) => {
        if (item.id === previousUserId) {
          return { ...item, id: event.userMessageId, conversation_id: event.conversationId };
        }
        if (item.id === previousAssistantId) {
          return { ...item, id: event.assistantMessageId, conversation_id: event.conversationId };
        }
        return item;
      }));
      setActiveConversationId(event.conversationId);
      const now = new Date().toISOString();
      setConversations((current) => [
        {
          id: event.conversationId,
          title: event.title,
          created_at: now,
          updated_at: now,
        },
        ...current.filter((item) => item.id !== event.conversationId),
      ]);
      if (!requestConversationId) {
        window.history.replaceState({ conversationId: event.conversationId }, "", `/c/${event.conversationId}`);
      }
      return;
    }

    if (event.type === "reasoning_delta") {
      if (generationRef.current) generationRef.current.reasoning += event.delta;
      setMessages((current) => current.map((item) => item.id === ids.assistant
        ? { ...item, reasoning_content: `${item.reasoning_content ?? ""}${event.delta}` }
        : item));
      return;
    }

    if (event.type === "content_delta") {
      if (generationRef.current) generationRef.current.content += event.delta;
      setMessages((current) => current.map((item) => item.id === ids.assistant
        ? { ...item, content: `${item.content}${event.delta}` }
        : item));
      return;
    }

    if (event.type === "done") {
      updateMessage(ids.assistant, { status: event.status, duration_ms: event.durationMs });
      return;
    }

    setError(event.message);
    updateMessage(ids.assistant, { status: "error" });
  }

  async function sendMessage() {
    const message = input.trim();
    if (!message || isStreaming) return;

    const requestConversationId = activeConversationId;
    const timestamp = new Date().toISOString();
    const tempUserId = `user-${crypto.randomUUID()}`;
    const tempAssistantId = `assistant-${crypto.randomUUID()}`;
    const optimisticConversationId = requestConversationId ?? "pending";
    const ids = { user: tempUserId, assistant: tempAssistantId };
    const controller = new AbortController();

    setMessages((current) => [
      ...current,
      {
        id: tempUserId,
        conversation_id: optimisticConversationId,
        role: "user",
        content: message,
        reasoning_content: null,
        model_preset: null,
        status: "completed",
        duration_ms: null,
        created_at: timestamp,
      },
      {
        id: tempAssistantId,
        conversation_id: optimisticConversationId,
        role: "assistant",
        content: "",
        reasoning_content: "",
        model_preset: preset,
        status: "streaming",
        duration_ms: null,
        created_at: timestamp,
      },
    ]);
    setInput("");
    setError("");
    setIsStreaming(true);
    generationRef.current = {
      controller,
      assistantId: tempAssistantId,
      content: "",
      reasoning: "",
      startedAt: Date.now(),
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: requestConversationId, message, preset }),
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
    const durationMs = Date.now() - generation.startedAt;
    generation.controller.abort();
    generationRef.current = null;
    updateMessage(generation.assistantId, { status: "stopped", duration_ms: durationMs });
    setIsStreaming(false);

    if (!generation.assistantId.startsWith("assistant-")) {
      void fetch(`/api/messages/${generation.assistantId}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: generation.content,
          reasoning: generation.reasoning,
          durationMs,
        }),
        keepalive: true,
      });
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar${sidebarOpen ? " is-open" : ""}`}>
        <div className="sidebar-header">
          <button className="brand" type="button" onClick={newChat} disabled={isStreaming}>
            <span className="brand-mark"><Sparkles size={16} /></span>
            <span>DeepSeek <em>Chat</em></span>
          </button>
          <button className="mobile-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={20} /></button>
        </div>
        <nav className="sidebar-actions" aria-label="Chat navigation">
          <button type="button" onClick={newChat} disabled={isStreaming}><SquarePen size={18} /><span>New chat</span></button>
          <button type="button" onClick={() => { setSearchOpen(true); setSidebarOpen(false); }} disabled={isStreaming}><Search size={18} /><span>Search chats</span></button>
        </nav>
        <div className="recent-heading">Recent</div>
        <div className="conversation-list">
          {conversations.length ? conversations.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              className={conversation.id === activeConversationId ? "active" : ""}
              onClick={() => void openConversation(conversation.id)}
              disabled={isStreaming}
              title={conversation.title}
            >
              {conversation.title}
            </button>
          )) : <p className="empty-recents">Your chats will appear here.</p>}
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}

      <section className="chat-panel">
        <header className="mobile-header">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={21} /></button>
          <span><Sparkles size={15} /> DeepSeek Chat</span>
          <div aria-hidden="true" />
        </header>

        <div className="messages-scroll">
          {loadingChat ? (
            <div className="loading-chat"><span /><span /><span /></div>
          ) : messages.length ? (
            <div className="messages-column">
              {messages.map((message) => <Message key={message.id} message={message} />)}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="empty-chat">
              <div className="empty-mark"><Sparkles size={25} /></div>
              <h1>What can I help you think through?</h1>
              <p>Choose a thinking level and start a conversation with DeepSeek V4.</p>
            </div>
          )}
        </div>

        <div className="composer-dock">
          {error && <div className="error-banner" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}
          <div className="composer">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Message DeepSeek"
              rows={1}
              disabled={isStreaming}
              aria-label="Message DeepSeek"
            />
            <div className="composer-toolbar">
              <ModelMenu value={preset} onChange={setPreset} disabled={isStreaming} />
              {isStreaming ? (
                <button className="send-button stop-button" type="button" onClick={stopOutput} aria-label="Stop response"><Square size={14} fill="currentColor" /></button>
              ) : (
                <button className="send-button" type="button" onClick={() => void sendMessage()} disabled={!input.trim()} aria-label="Send message"><ArrowUp size={19} strokeWidth={2.4} /></button>
              )}
            </div>
          </div>
          <p className="composer-note">DeepSeek can make mistakes. Check important information.</p>
        </div>
      </section>

      {searchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search chats">
          <button className="search-scrim" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)} />
          <section className="search-dialog">
            <div className="search-input-wrap"><Search size={19} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search your chats" /><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close"><X size={19} /></button></div>
            <div className="search-results">
              {searchResults.length ? searchResults.map((conversation) => (
                <button type="button" key={conversation.id} onClick={() => void openConversation(conversation.id)}>
                  <MessageSquare size={17} /><span>{conversation.title}<small>{new Date(conversation.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small></span>
                </button>
              )) : <p>No chats found.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
