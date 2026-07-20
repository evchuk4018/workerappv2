import { useEffect, type RefObject } from "react";
import { ArrowUp, Brain, BrainCircuit, Menu, Sparkles, Square, X } from "lucide-react";
import { Message } from "@/components/chat/message";
import { ModelMenu } from "@/components/chat/model-menu";
import type { ModelPreset } from "@/lib/models";
import type { ChatMessage } from "@/lib/types";
import type { MemoryMode } from "@/lib/memory/types";
import { AttachmentChips, type AttachmentItem } from "./attachment-chips";
import { AttachmentPicker } from "./attachment-picker";

interface ChatPanelProps {
  messages: ChatMessage[];
  loadingChat: boolean;
  input: string;
  preset: ModelPreset;
  memoryMode: MemoryMode;
  isStreaming: boolean;
  error: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onPresetChange: (value: ModelPreset) => void;
  onToggleMemoryMode: () => void;
  onOpenSidebar: () => void;
  onSend: () => void;
  onStop: () => void;
  onDismissError: () => void;
  attachments: AttachmentItem[];
  onFilesSelected: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

export function ChatPanel({
  messages,
  loadingChat,
  input,
  preset,
  memoryMode,
  isStreaming,
  error,
  textareaRef,
  bottomRef,
  onInputChange,
  onPresetChange,
  onToggleMemoryMode,
  onOpenSidebar,
  onSend,
  onStop,
  onDismissError,
  attachments,
  onFilesSelected,
  onRemoveAttachment,
}: ChatPanelProps) {
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
  }, [input, textareaRef]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <section className="chat-panel">
      <header className="mobile-header">
        <button type="button" onClick={onOpenSidebar} aria-label="Open sidebar"><Menu size={21} /></button>
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
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button type="button" onClick={onDismissError} aria-label="Dismiss"><X size={15} /></button>
          </div>
        )}
        <div className="composer">
          <AttachmentChips
            attachments={attachments}
            onRemove={onRemoveAttachment}
            disabled={isStreaming}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message DeepSeek"
            rows={1}
            disabled={isStreaming}
            aria-label="Message DeepSeek"
          />
          <div className="composer-toolbar">
            <AttachmentPicker onFilesSelected={onFilesSelected} disabled={isStreaming} />
            <ModelMenu value={preset} onChange={onPresetChange} disabled={isStreaming} />
            <button
              className={`memory-mode-button ${memoryMode === "off" ? "memory-off" : ""}`}
              type="button"
              onClick={onToggleMemoryMode}
              disabled={isStreaming}
              aria-label={memoryMode === "off" ? "Turn memory on for this chat" : "Turn memory off for this chat"}
              title={memoryMode === "off" ? "Memory is off for this chat" : "Memory is on for this chat"}
            >
              {memoryMode === "off" ? <Brain size={16} /> : <BrainCircuit size={16} />}
              <span>{memoryMode === "off" ? "Memory off" : "Memory on"}</span>
            </button>
            {isStreaming ? (
              <button className="send-button stop-button" type="button" onClick={onStop} aria-label="Stop response">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button className="send-button" type="button" onClick={onSend} disabled={!input.trim()} aria-label="Send message">
                <ArrowUp size={19} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
        <p className="composer-note">DeepSeek can make mistakes. Check important information.</p>
      </div>
    </section>
  );
}
