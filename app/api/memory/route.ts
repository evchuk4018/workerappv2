import { NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/supabase/auth-user";

export async function GET() {
  const auth = await getAllowedUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [profiles, reviews, changes] = await Promise.all([
    auth.supabase.from("memory_profiles").select([
      "id", "version", "status", "profile_text", "profile_json", "token_estimate",
      "based_on_profile_id", "trigger_reason", "rejection_reason", "created_at", "activated_at",
    ].join(",")).eq("user_id", auth.user.id).order("version", { ascending: false }).limit(20),
    auth.supabase.from("memory_reviews").select([
      "id", "operation", "proposed_content", "memory_type", "confidence", "reason", "state",
      "related_memory_id", "source_conversation_id", "source_message_id", "created_at", "reviewed_at",
    ].join(",")).eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50),
    auth.supabase.from("memory_events").select("id,memory_id,action,actor,metadata,created_at")
      .eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (profiles.error || reviews.error || changes.error) {
    return NextResponse.json({ error: "Unable to load memory activity." }, { status: 500 });
  }
  return NextResponse.json({
    profiles: profiles.data ?? [],
    reviews: reviews.data ?? [],
    changes: changes.data ?? [],
  });
}

