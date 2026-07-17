import { BrainCircuit, ChevronDown } from "lucide-react";
import type { ToolActivity } from "@/lib/tool-activity";
import { ToolActivityList } from "./tool-activity-list";

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "";
  if (durationMs < 1000) return "under a second";
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${seconds}s`;
}

export function ThinkingBlock({
  reasoning,
  state,
  durationMs,
  activities,
}: {
  reasoning: string;
  state: "active" | "completed" | "stopped";
  durationMs: number | null;
  activities: ToolActivity[];
}) {
  if (!reasoning && !activities.length && state !== "active") return null;
  const duration = formatDuration(durationMs);
  const label = state === "active"
    ? "Thinking"
    : state === "stopped"
      ? `Stopped thinking${duration ? ` after ${duration}` : ""}`
      : `Thought${duration ? ` for ${duration}` : ""}`;

  return (
    <details className="thinking-block">
      <summary className="thinking-toggle">
        <BrainCircuit size={17} />
        <span>{label}</span>
        {state === "active" && <span className="thinking-pulse" aria-label="Generating" />}
        <ChevronDown className="thinking-chevron" size={16} />
      </summary>
      <div className="thinking-content">
        {(reasoning || state === "active") && (
          <div className="thinking-reasoning">
            {reasoning || "Working through the request…"}
          </div>
        )}
        <ToolActivityList activities={activities} />
      </div>
    </details>
  );
}
