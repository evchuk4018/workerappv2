import type { ReasoningBlock } from "@/lib/reasoning-block";
import type { ChatMessage, MessageStatus } from "@/lib/types";
import type { ToolActivity } from "@/lib/tool-activity";
import { ThinkingBlock } from "./thinking-block";

function blockState(
  block: ReasoningBlock,
  isLast: boolean,
  status: MessageStatus,
) {
  if (isLast && status === "streaming" && block.duration_ms === null) return "active" as const;
  if (isLast && status === "stopped" && block.duration_ms === null) return "stopped" as const;
  return "completed" as const;
}

function activitiesForRound(
  activities: ToolActivity[],
  roundIndex: number,
  includeLegacy: boolean,
) {
  return activities
    .filter((activity) => activity.round_index === roundIndex
      || (includeLegacy && activity.round_index === undefined))
    .sort((left, right) => (left.call_index ?? 0) - (right.call_index ?? 0));
}

export function ReasoningTimeline({ message }: { message: ChatMessage }) {
  if (message.reasoning_blocks.length) {
    return (
      <div className="reasoning-timeline">
        {message.reasoning_blocks.map((block, index) => (
          <ThinkingBlock
            key={block.round_index}
            reasoning={block.content}
            state={blockState(
              block,
              index === message.reasoning_blocks.length - 1,
              message.status,
            )}
            durationMs={block.duration_ms}
            activities={activitiesForRound(message.tool_activity, block.round_index, index === 0)}
          />
        ))}
      </div>
    );
  }

  const showPlaceholder = message.status === "streaming" && !message.content;
  if (!message.reasoning_content && !message.tool_activity.length && !showPlaceholder) return null;
  const state = message.status === "streaming"
    ? "active" as const
    : message.status === "stopped"
      ? "stopped" as const
      : "completed" as const;

  return (
    <div className="reasoning-timeline">
      <ThinkingBlock
        reasoning={message.reasoning_content ?? ""}
        state={state}
        durationMs={message.duration_ms}
        activities={message.tool_activity}
      />
    </div>
  );
}
