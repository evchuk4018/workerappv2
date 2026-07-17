import { NextResponse, type NextRequest } from "next/server";
import { createManualMemory, parseMemoryType, parseOptionalScore } from "@/lib/memory/store";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import type { MemoryState, MemoryType } from "@/lib/memory/types";

const MEMORY_STATES = new Set<MemoryState>(["active", "pending_review", "superseded", "expired", "deleted"]);
const MEMORY_TYPES = new Set<MemoryType>(["instruction", "preference", "fact", "goal", "constraint", "project", "relationship", "event", "temporary"]);

export async function GET(request: NextRequest) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  const state = request.nextUrl.searchParams.get("state");
  const type = request.nextUrl.searchParams.get("type");
  let query = auth.supabase.from("user_memories").select([
    "id", "canonical_content", "memory_type", "confidence", "salience", "usefulness",
    "origin", "pinned", "state", "valid_from", "valid_until", "confirmed_at",
    "last_used_at", "use_count", "supersedes_memory_id", "created_at", "updated_at", "deleted_at",
  ].join(",")).eq("user_id", auth.user.id).order("updated_at", { ascending: false }).limit(100);
  if (state && MEMORY_STATES.has(state as MemoryState)) query = query.eq("state", state as MemoryState);
  else query = query.neq("state", "deleted");
  if (type && MEMORY_TYPES.has(type as MemoryType)) query = query.eq("memory_type", type as MemoryType);
  if (search) query = query.textSearch("search_vector", search, { type: "websearch", config: "simple" });
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load memories." }, { status: 500 });
  return NextResponse.json({ memories: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  try {
    if (typeof body.content !== "string") throw new TypeError("Memory content is required.");
    const memory = await createManualMemory({
      supabase: auth.supabase,
      userId: auth.user.id,
      content: body.content,
      memoryType: parseMemoryType(body.memoryType),
      pinned: body.pinned === true,
      salience: parseOptionalScore(body.salience, 0.7),
      validUntil: typeof body.validUntil === "string" ? body.validUntil : null,
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Invalid memory." }, { status: 400 });
  }
}
