import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { AlertCircle } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import type { ChatMessage } from "@/lib/types";
import { AttachmentChips } from "./attachment-chips";
import { ReasoningTimeline } from "./reasoning-timeline";

function LinkedImage({ src, alt }: ComponentPropsWithoutRef<"img">) {
  if (typeof src !== "string" || !src) {
    return <span>{alt?.trim() || "Image unavailable"}</span>;
  }
  return <a href={src}>{alt?.trim() || "Image link"}</a>;
}

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <article className="message-row user-row">
        <div className="user-message-content">
          <div className="user-bubble">{message.content}</div>
          <AttachmentChips attachments={message.attachments ?? []} />
        </div>
      </article>
    );
  }

  return (
    <article className="message-row assistant-row">
      <ReasoningTimeline message={message} />
      {message.content ? (
        <div className="markdown-body">
          <Markdown
            components={{ img: LinkedImage }}
            rehypePlugins={[
              [rehypeKatex, { errorColor: "#ff8585", strict: "ignore", trust: false }],
              [rehypeHighlight, { detect: false }],
            ]}
            remarkPlugins={[remarkGfm, remarkMath]}
            skipHtml
          >
            {message.content}
          </Markdown>
        </div>
      ) : message.status === "error" ? (
        <div className="message-error"><AlertCircle size={17} /> DeepSeek could not complete this response.</div>
      ) : null}
      {message.status === "stopped" && <p className="stopped-label">Response stopped</p>}
    </article>
  );
}
