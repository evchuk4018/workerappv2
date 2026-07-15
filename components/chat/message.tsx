import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { ThinkingBlock } from "./thinking-block";

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <article className="message-row user-row">
        <div className="user-bubble">{message.content}</div>
      </article>
    );
  }

  return (
    <article className="message-row assistant-row">
      <ThinkingBlock
        reasoning={message.reasoning_content ?? ""}
        status={message.status}
        durationMs={message.duration_ms}
      />
      {message.content ? (
        <div className="markdown-body">
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
        </div>
      ) : message.status === "streaming" && !message.reasoning_content ? (
        <div className="typing-dots" aria-label="DeepSeek is responding"><i /><i /><i /></div>
      ) : message.status === "error" ? (
        <div className="message-error"><AlertCircle size={17} /> DeepSeek could not complete this response.</div>
      ) : null}
      {message.status === "stopped" && <p className="stopped-label">Response stopped</p>}
    </article>
  );
}
