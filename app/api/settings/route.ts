import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { normalizeSystemPrompt } from "@/lib/system-prompt";
import {
  memorySettingsFromRow,
  memorySettingsToRow,
  parseMemorySettings,
} from "@/lib/memory/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("user_settings")
    .select("system_prompt,saved_memory_enabled,previous_conversations_enabled,inferred_memory_enabled,memory_write_mode")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load settings." }, { status: 500 });
  }
  return NextResponse.json({
    systemPrompt: data?.system_prompt ?? "",
    memorySettings: memorySettingsFromRow(data),
  });
}

export async function PUT(request: Request) {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { systemPrompt?: unknown; memorySettings?: unknown };
  try {
    body = (await request.json()) as { systemPrompt?: unknown; memorySettings?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.systemPrompt === undefined && body.memorySettings === undefined) {
    return NextResponse.json({ error: "At least one setting is required." }, { status: 400 });
  }

  let systemPrompt: string | undefined;
  let memorySettings;
  try {
    if (body.systemPrompt !== undefined) {
      if (typeof body.systemPrompt !== "string") throw new TypeError("Invalid system prompt.");
      systemPrompt = normalizeSystemPrompt(body.systemPrompt);
    }
    if (body.memorySettings !== undefined) memorySettings = parseMemorySettings(body.memorySettings);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Invalid system prompt." },
      { status: 400 },
    );
  }

  const { error } = await auth.supabase.from("user_settings").upsert(
    {
      user_id: auth.user.id,
      ...(systemPrompt !== undefined ? { system_prompt: systemPrompt } : {}),
      ...(memorySettings ? memorySettingsToRow(memorySettings) : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: "Unable to save settings." }, { status: 500 });
  }
  const { data } = await auth.supabase.from("user_settings")
    .select("system_prompt,saved_memory_enabled,previous_conversations_enabled,inferred_memory_enabled,memory_write_mode")
    .eq("user_id", auth.user.id).maybeSingle();
  return NextResponse.json({
    systemPrompt: systemPrompt ?? data?.system_prompt ?? "",
    memorySettings: memorySettings ?? memorySettingsFromRow(data),
  });
}
