import { describe, expect, it, vi } from "vitest";
import { finalizeConversationTitle } from "./title-finalization";

function createSupabaseMock(fallbackTitle = "Help me build authentication") {
  const calls: { update?: Record<string, unknown>; is?: [string, unknown] } = {};
  const chain = {
    update(value: Record<string, unknown>) {
      calls.update = value;
      return chain;
    },
    eq() { return chain; },
    is(column: string, value: unknown) {
      calls.is = [column, value];
      return chain;
    },
    select() { return chain; },
    async maybeSingle() {
      return {
        data: { title: String(calls.update?.title ?? fallbackTitle) },
        error: null,
      };
    },
  };
  return { supabase: { from: () => chain } as never, calls };
}

const messages = [{ role: "user" as const, content: "Help me build authentication" }];

describe("title finalization", () => {
  it("saves a generated title and finalizes only a pending conversation", async () => {
    const { supabase, calls } = createSupabaseMock();
    const fetcher = vi.fn(async () => Response.json({
      choices: [{ message: { content: "Authentication Design" } }],
    })) as unknown as typeof fetch;

    await expect(finalizeConversationTitle({
      supabase,
      conversationId: "conversation-1",
      messages,
      apiKey: "secret",
      fetcher,
    })).resolves.toBe("Authentication Design");
    expect(calls.update).toMatchObject({ title: "Authentication Design" });
    expect(calls.update?.title_finalized_at).toEqual(expect.any(String));
    expect(calls.is).toEqual(["title_finalized_at", null]);
  });

  it("finalizes the fallback after one failed title attempt", async () => {
    const { supabase, calls } = createSupabaseMock();
    const fetcher = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

    await expect(finalizeConversationTitle({
      supabase,
      conversationId: "conversation-1",
      messages,
      apiKey: "secret",
      fetcher,
    })).resolves.toBeNull();
    expect(calls.update).not.toHaveProperty("title");
    expect(calls.update?.title_finalized_at).toEqual(expect.any(String));
  });
});
