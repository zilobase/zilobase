import { AgentChatLayout } from "./agent-chat-layout";

import { AgentLiveDebugger } from "./elements/agent-live-debugger";

import { Button } from "@/shared/ui/button";

import { ChatbotComposer } from "./elements/chatbot-composer";
import { ChatbotMessages } from "./elements/chatbot-messages";

import { useChatbotConversation } from "../use-chatbot-conversation";
import type { ChatbotConversationInput } from "../conversation-interface";

export function ChatbotConversationController(props: ChatbotConversationInput) {
  const { isSidebar = false, beforeComposer } = props;
  const {
    rootRef,
    hasMessages,
    session,
    setText,
    liveDebugger,
    status,
    messagesProps,
    composerProps,
  } = useChatbotConversation(props);
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={rootRef}
        data-ai-scroll-shell
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <AgentChatLayout sidebar={isSidebar}>
          {!hasMessages && (
            <div className="mx-auto mb-6 grid w-full max-w-3xl justify-items-center gap-3 px-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-secondary text-lg font-semibold">
                AI
              </div>
              <div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {getGreeting(session?.user?.name)}
                </h1>
                <p className="mt-1 text-sm text-content-secondary">
                  Search, create, and work across your Zilobase workspace.
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {starterPrompts.map(
                  (prompt) => (
                    <Button
                      key={prompt}
                      onClick={() => setText(prompt)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {prompt}
                    </Button>
                  ),
                )}
              </div>
            </div>
          )}
          <ChatbotMessages
            {...messagesProps}
            debuggerContent={
              import.meta.env.DEV ? (
                <AgentLiveDebugger
                  events={liveDebugger.events}
                  status={status}
                  turnStartedAt={liveDebugger.turnStartedAt}
                />
              ) : null
            }
          />
        </AgentChatLayout>
      </div>
      <AgentChatLayout sidebar={isSidebar}>
        {beforeComposer}
        <ChatbotComposer {...composerProps} />
      </AgentChatLayout>
    </div>
  );
}

function getGreeting(name?: string | null) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

const starterPrompts = [
  "Summarize my workspace",
  "Find relevant information",
  "Create a project plan",
];
