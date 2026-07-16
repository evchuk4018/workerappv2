import type { RefObject } from "react";
import { Search, Settings, Sparkles, SquarePen, X } from "lucide-react";
import type { ConversationSummary } from "@/lib/types";

interface ChatSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  open: boolean;
  isStreaming: boolean;
  settingsButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onNewChat: () => void;
  onSearch: () => void;
  onSettings: () => void;
  onOpenConversation: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  open,
  isStreaming,
  settingsButtonRef,
  onClose,
  onNewChat,
  onSearch,
  onSettings,
  onOpenConversation,
}: ChatSidebarProps) {
  return (
    <aside className={`sidebar${open ? " is-open" : ""}`}>
      <div className="sidebar-header">
        <button className="brand" type="button" onClick={onNewChat} disabled={isStreaming}>
          <span className="brand-mark"><Sparkles size={16} /></span>
          <span>DeepSeek <em>Chat</em></span>
        </button>
        <button className="mobile-close" type="button" onClick={onClose} aria-label="Close sidebar">
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-actions" aria-label="Chat navigation">
        <button type="button" onClick={onNewChat} disabled={isStreaming}>
          <SquarePen size={18} /><span>New chat</span>
        </button>
        <button type="button" onClick={onSearch} disabled={isStreaming}>
          <Search size={18} /><span>Search chats</span>
        </button>
      </nav>

      <div className="recent-heading">Recent</div>
      <div className="conversation-list">
        {conversations.length ? conversations.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={conversation.id === activeConversationId ? "active" : ""}
            onClick={() => onOpenConversation(conversation.id)}
            disabled={isStreaming}
            title={conversation.title}
          >
            {conversation.title}
          </button>
        )) : <p className="empty-recents">Your chats will appear here.</p>}
      </div>

      <div className="sidebar-footer">
        <button ref={settingsButtonRef} type="button" onClick={onSettings}>
          <Settings size={18} /><span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
