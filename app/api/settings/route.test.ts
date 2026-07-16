import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { GET, PUT } from "./route";

vi.mock("@/lib/supabase/auth-user", () => ({
  getAllowedUser: vi.fn(),
}));

const mockedGetAllowedUser = vi.mocked(getAllowedUser);

function createAuth(options?: {
  setting?: string | null;
  selectError?: { message: string } | null;
  upsertError?: { message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.setting === null ? null : { system_prompt: options?.setting ?? "Saved" },
    error: options?.selectError ?? null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn().mockResolvedValue({ error: options?.upsertError ?? null });
  const from = vi.fn(() => ({ select, upsert }));

  return {
    auth: { user: { id: "user-123" }, supabase: { from } },
    from,
    upsert,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("settings API", () => {
  it("rejects unauthenticated reads and writes", async () => {
    mockedGetAllowedUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    const response = await PUT(new Request("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({ systemPrompt: "Prompt" }),
    }));
    expect(response.status).toBe(401);
  });

  it("returns a blank prompt when the user has no settings row", async () => {
    const { auth } = createAuth({ setting: null });
    mockedGetAllowedUser.mockResolvedValue(auth as never);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ systemPrompt: "" });
  });

  it("normalizes and upserts the authenticated user's prompt", async () => {
    const { auth, from, upsert } = createAuth();
    mockedGetAllowedUser.mockResolvedValue(auth as never);

    const response = await PUT(new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: " \n " }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ systemPrompt: "" });
    expect(from).toHaveBeenCalledWith("user_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-123", system_prompt: "" }),
      { onConflict: "user_id" },
    );
  });

  it("rejects invalid prompt input before writing", async () => {
    const { auth, upsert } = createAuth();
    mockedGetAllowedUser.mockResolvedValue(auth as never);
    const response = await PUT(new Request("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({ systemPrompt: 42 }),
    }));
    expect(response.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps database load and save failures explicit", async () => {
    const load = createAuth({ selectError: { message: "failed" } });
    mockedGetAllowedUser.mockResolvedValue(load.auth as never);
    expect((await GET()).status).toBe(500);

    const save = createAuth({ upsertError: { message: "failed" } });
    mockedGetAllowedUser.mockResolvedValue(save.auth as never);
    const response = await PUT(new Request("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({ systemPrompt: "Prompt" }),
    }));
    expect(response.status).toBe(500);
  });
});
