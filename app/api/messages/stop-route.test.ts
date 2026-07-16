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
    const stoppedUpdate = chain({ data: null, error: null });
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
        return [assistantLookup, stoppedUpdate, transcriptLookup][messageCall - 1];
      }),
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
    expect(stoppedUpdate.update).toHaveBeenCalledWith({
      content: "A partial explanation",
      reasoning_content: "Partial reasoning",
      tool_activity: [expect.objectContaining({
        id: "search-1",
        status: "error",
        error: "Stopped before this tool completed.",
      })],
      duration_ms: 123,
      status: "stopped",
    });
    expect(finalizeConversationTitle).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-1",
      messages: transcript,
    }));
  });
});
