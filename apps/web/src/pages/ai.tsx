import Chatbot from "@/components/ai-elements/chatbot";
import { AiChatThreadsPanel } from "@/components/ai-elements/ai-chat-threads-panel";
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state";

export default function AiPage() {
  const { activeThreadId, isBootstrapping, setActiveThreadId } =
    useAiChatThreadState();

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <main className="box-border flex h-full min-h-0 overflow-hidden px-4 py-4 md:py-6">
        <section className="mx-auto grid h-full min-h-0 w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden min-h-0 overflow-hidden rounded-xl border bg-background md:flex md:flex-col">
            <AiChatThreadsPanel
              activeThreadId={activeThreadId}
              onSelectThread={setActiveThreadId}
            />
          </aside>
          <section className="min-h-0 overflow-hidden">
            {isBootstrapping || !activeThreadId ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                Loading chat...
              </div>
            ) : (
              <Chatbot key={activeThreadId} threadId={activeThreadId} />
            )}
          </section>
        </section>
      </main>
    </div>
  );
}