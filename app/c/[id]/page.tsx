import { ChatLoader } from "@/components/chat-loader";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatLoader conversationId={id} />;
}
