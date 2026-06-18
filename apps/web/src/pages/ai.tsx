import Chatbot from "@/components/ai-elements/chatbot";
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state";

export default function AiPage() {
  const { activeThreadId, isBootstrapping } = useAiChatThreadState();

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <main className="box-border flex h-full min-h-0 overflow-hidden px-4 py-4 md:py-6">
        <section className="mx-auto h-full min-h-0 w-full max-w-6xl overflow-hidden">
          {isBootstrapping || !activeThreadId ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Loading chat...
            </div>
          ) : (
            <Chatbot key={activeThreadId} threadId={activeThreadId} />
          )}
        </section>
      </main>
    </div>
  );
}