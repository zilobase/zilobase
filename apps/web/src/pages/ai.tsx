import { lazy, Suspense } from "react";

import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state";

const Chatbot = lazy(() => import("@/components/ai-elements/chatbot"));

export default function AiPage() {
  const { activeThreadId, isBootstrapping, setActiveThreadId } =
    useAiChatThreadState();

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <main className="box-border flex h-full min-h-0 overflow-hidden px-4 py-4 md:py-6">
        <section className="mx-auto h-full min-h-0 w-full max-w-6xl overflow-hidden">
          {isBootstrapping ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Loading chat...
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Loading chat...
                </div>
              }
            >
              <Chatbot
                key={activeThreadId ?? "new"}
                onThreadCreated={setActiveThreadId}
                threadId={activeThreadId}
              />
            </Suspense>
          )}
        </section>
      </main>
    </div>
  );
}
