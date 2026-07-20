import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/auth-user", () => ({ getAllowedUser: vi.fn() }));
vi.mock("@/lib/title-finalization", () => ({ finalizeConversationTitle: vi.fn() }));

import { POST } from "@/app/api/messages/[id]/stop/route";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { finalizeConversationTitle } from "@/lib/title-finalization";

function chain(result: Record<string, unknown>) {
  const value = {
    ...result,
    select: () => value,
    update: vi.fn(() => value),
    eq: () => value,
    in: () => value,
    order: () => value,
    maybeSingle: async () => result,
  };
  return value;
}

describe("stop response route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists partial output and returns its generated title", async () => {
    const assistantLookup = chain({
      data: { id: "assistant-1", conversation_id: "conversation-1" },
      error: null,
    });
    const conversationLookup = chain({ data: { title_finalized_at: null }, error: null });
    const transcript = [
      { role: "user", content: "Explain streaming" },
      { role: "assistant", content: "A partial explanation" },
    ];
    const transcriptLookup = chain({ data: transcript, error: null });
    let messageCall = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "conversations") return conversationLookup;
        messageCall += 1;
        return [assistantLookup, transcriptLookup][messageCall - 1];
      }),
      rpc: vi.fn().mockResolvedValue({ data: "stopped", error: null }),
    };
    vi.mocked(getAllowedUser).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);
    vi.mocked(finalizeConversationTitle).mockResolvedValue("Streaming Responses");

    const response = await POST(
      new Request("http://localhost/api/messages/assistant-1/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "A partial explanation",
          reasoning: "Partial reasoning",
          reasoningBlocks: [{
            round_index: 0,
            content: "Partial reasoning",
            duration_ms: 80,
          }],
          toolActivity: [{
            id: "search-1",
            kind: "search",
            provider: "brave",
            status: "running",
            query: "streaming",
            sources: [],
            started_at: "2026-07-16T00:00:00.000Z",
          }],
          durationMs: 123.4,
        }),
      }),
      { params: Promise.resolve({ id: "assistant-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, title: "Streaming Responses" });
    expect(supabase.rpc).toHaveBeenCalledWith("stop_agent_run", {
      p_assistant_message_id: "assistant-1",
      p_content: "A partial explanation",
      p_reasoning: "Partial reasoning",
      p_reasoning_blocks: [{
        round_index: 0,
        content: "Partial reasoning",
        duration_ms: 80,
      }],
      p_tool_activity: [expect.objectContaining({
        id: "search-1",
        status: "error",
        error: "Stopped before this tool completed.",
      })],
      p_duration_ms: 123,
    });
    expect(finalizeConversationTitle).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-1",
      messages: transcript,
    }));
  });
});
