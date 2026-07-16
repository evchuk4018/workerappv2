import { useEffect, type RefObject } from "react";
import { ArrowUp, Menu, Sparkles, Square, X } from "lucide-react";
import { Message } from "@/components/chat/message";
import { ModelMenu } from "@/components/chat/model-menu";
import type { ModelPreset } from "@/lib/models";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  loadingChat: boolean;
  input: string;
  preset: ModelPreset;
  isStreaming: boolean;
  error: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onPresetChange: (value: ModelPreset) => void;
  onOpenSidebar: () => void;
  onSend: () => void;
  onStop: () => void;
  onDismissError: () => void;
}

export function ChatPanel({
  messages,
  loadingChat,
  input,
  preset,
  isStreaming,
  error,
  textareaRef,
  bottomRef,
  onInputChange,
  onPresetChange,
  onOpenSidebar,
  onSend,
  onStop,
  onDismissError,
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
            <ModelMenu value={preset} onChange={onPresetChange} disabled={isStreaming} />
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
