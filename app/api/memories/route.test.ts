import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { createManualMemory } from "@/lib/memory/store";
import { POST } from "./route";

vi.mock("@/lib/supabase/auth-user", () => ({ getAllowedUser: vi.fn() }));
vi.mock("@/lib/memory/store", async (original) => {
  const actual = await original<typeof import("@/lib/memory/store")>();
  return { ...actual, createManualMemory: vi.fn() };
});

const authMock = vi.mocked(getAllowedUser);
const createMock = vi.mocked(createManualMemory);

afterEach(() => vi.clearAllMocks());

describe("memory creation API", () => {
  it("requires authentication", async () => {
    authMock.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/memories", {
      method: "POST", body: JSON.stringify({ content: "Remember this", memoryType: "fact" }),
    }));
    expect(response.status).toBe(401);
  });

  it("validates manual memory types before writing", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" }, supabase: {} } as never);
    const response = await POST(new Request("http://localhost/api/memories", {
      method: "POST", body: JSON.stringify({ content: "Remember this", memoryType: "secret" }),
    }));
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates confirmed explicit-authority memories for the authenticated owner", async () => {
    const supabase = { marker: "client" };
    authMock.mockResolvedValue({ user: { id: "u1" }, supabase } as never);
    createMock.mockResolvedValue({ id: "m1" } as never);
    const response = await POST(new Request("http://localhost/api/memories", {
      method: "POST",
      body: JSON.stringify({ content: "Use UTC", memoryType: "instruction", pinned: true }),
    }));
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      supabase, userId: "u1", content: "Use UTC", memoryType: "instruction", pinned: true,
    }));
  });
});
