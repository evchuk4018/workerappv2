import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateConversationTitle,
  type TitleTranscriptMessage,
} from "@/lib/conversation-title";
import type { Database } from "@/lib/database.types";

interface FinalizeTitleOptions {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  messages: TitleTranscriptMessage[];
  apiKey?: string;
  fetcher?: typeof fetch;
}

export async function finalizeConversationTitle({
  supabase,
  conversationId,
  messages,
  apiKey,
  fetcher,
}: FinalizeTitleOptions) {
  let generatedTitle: string | null = null;
  try {
    if (apiKey) {
      generatedTitle = await generateConversationTitle(messages, apiKey, fetcher);
    }
  } catch {
    // One failed title attempt permanently keeps the existing fallback.
  }

  const finalizedAt = new Date().toISOString();
  const update = generatedTitle
    ? { title: generatedTitle, title_finalized_at: finalizedAt }
    : { title_finalized_at: finalizedAt };
  const { data, error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", conversationId)
    .is("title_finalized_at", null)
    .select("title")
    .maybeSingle();

  if (error || !data || !generatedTitle) return null;
  return data.title;
}
