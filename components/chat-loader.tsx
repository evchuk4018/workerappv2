import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat/chat-app";
import { getAllowedUser } from "@/lib/supabase/auth-user";
import { normalizeReasoningBlocks } from "@/lib/reasoning-block";
import { normalizeToolActivities } from "@/lib/tool-activity";

export async function ChatLoader({ conversationId }: { conversationId?: string }) {
  const auth = await getAllowedUser();
  if (!auth) redirect("/login");

  const { data: conversations } = await auth.supabase
    .from("conversations")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  let messages = null;
  let validConversationId: string | null = null;

  if (conversationId) {
    const { data: conversation } = await auth.supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversation) {
      validConversationId = conversation.id;
      const { data } = await auth.supabase
        .from("messages")
        .select("id,conversation_id,role,content,reasoning_content,reasoning_blocks,tool_activity,model_preset,status,duration_ms,created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      messages = data?.map((item) => ({
        ...item,
        reasoning_blocks: normalizeReasoningBlocks(item.reasoning_blocks),
        tool_activity: normalizeToolActivities(item.tool_activity),
      })) ?? null;
    }
  }

  return (
    <ChatApp
      initialConversations={conversations ?? []}
      initialConversationId={validConversationId}
      initialMessages={messages ?? []}
    />
  );
}
