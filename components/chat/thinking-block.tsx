"use client";

import { useState } from "react";
import { BrainCircuit, ChevronDown } from "lucide-react";
import type { MessageStatus } from "@/lib/types";

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "";
  if (durationMs < 1000) return "under a second";
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${seconds}s`;
}

export function ThinkingBlock({
  reasoning,
  status,
  durationMs,
}: {
  reasoning: string;
  status: MessageStatus;
  durationMs: number | null;
}) {
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const open = status === "streaming" || manuallyOpen;

  if (!reasoning && status !== "streaming") return null;
  const duration = formatDuration(durationMs);
  const label = status === "streaming"
    ? "Thinking"
    : status === "stopped"
      ? `Stopped thinking${duration ? ` after ${duration}` : ""}`
      : `Thought${duration ? ` for ${duration}` : ""}`;

  return (
    <section className={`thinking-block${open ? " is-open" : ""}`}>
      <button
        className="thinking-toggle"
        type="button"
        onClick={() => {
          if (status !== "streaming") setManuallyOpen((value) => !value);
        }}
        aria-expanded={open}
      >
        <BrainCircuit size={17} />
        <span>{label}</span>
        {status === "streaming" && <span className="thinking-pulse" aria-label="Generating" />}
        <ChevronDown className="thinking-chevron" size={16} />
      </button>
      {open && (
        <div className="thinking-content">
          {reasoning || "Working through the request…"}
        </div>
      )}
    </section>
  );
}
