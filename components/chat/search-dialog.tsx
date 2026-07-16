import { MessageSquare, Search, X } from "lucide-react";
import type { ConversationSummary } from "@/lib/types";

interface SearchDialogProps {
  query: string;
  results: ConversationSummary[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
}

export function SearchDialog({
  query,
  results,
  onQueryChange,
  onClose,
  onOpenConversation,
}: SearchDialogProps) {
  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search chats">
      <button className="search-scrim" type="button" aria-label="Close search" onClick={onClose} />
      <section className="search-dialog">
        <div className="search-input-wrap">
          <Search size={19} />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search your chats"
          />
          <button type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <div className="search-results">
          {results.length ? results.map((conversation) => (
            <button type="button" key={conversation.id} onClick={() => onOpenConversation(conversation.id)}>
              <MessageSquare size={17} />
              <span>
                {conversation.title}
                <small>{new Date(conversation.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}</small>
              </span>
            </button>
          )) : <p>No chats found.</p>}
        </div>
      </section>
    </div>
  );
}
