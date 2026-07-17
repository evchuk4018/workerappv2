import type { CurrentGeneration } from "@/components/chat/stream-event";

export async function persistStoppedGeneration(generation: CurrentGeneration) {
  try {
    const response = await fetch(`/api/messages/${generation.assistantId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: generation.content,
        reasoning: generation.reasoning,
        reasoningBlocks: generation.reasoningBlocks,
        toolActivity: generation.activities,
        durationMs: Date.now() - generation.startedAt,
      }),
      keepalive: true,
    });
    if (!response.ok) return null;
    const result = (await response.json()) as { title?: string };
    return result.title ?? null;
  } catch {
    return null;
  }
}
