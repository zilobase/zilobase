import { chatDisplayText } from "@zilobase/features/ai";
import { ChatSourceContext } from "./answer-sources";
import { MessageScrollerItem, MessageScrollerContent } from "@/components/ui/message-scroller";
import { Message, MessageContent } from "./message";
import { MessageActions } from "./message-actions";
import { MessageThinking } from "./message-thinking";
import { MessageSources } from "./message-sources";
import { ReadActivity } from "./read-activity";
import { lazy, Suspense, useMemo } from "react";
import type { ActivityActions, AgentActivity } from "../lib/agent-activity";
import { useSmoothText } from "../hooks/use-smooth-text";
import { Button } from "@/components/ui/button";

const LazyRunDebugger = lazy(() =>
  import("./run-debugger").then((module) => ({ default: module.RunDebugger })),
);

const LazyMessageActivity = lazy(() => import("./message-activity"));

import type { ChatMessage } from "@zilobase/features/ai";
export type { ChatMessage } from "@zilobase/features/ai";

export function ChatbotMessages({
  workspaceId = null,
  isSidebar,
  messages,
  streaming = false,
  pendingLabel,
  onRetry,
  activityByMessage,
  activityActions,
  onContinue,
}: {
  workspaceId?: string | null;
  isSidebar: boolean;
  messages: ChatMessage[];
  streaming?: boolean;
  pendingLabel?: string;
  onRetry?: () => void;
  activityByMessage?: Readonly<Record<string, readonly AgentActivity[]>>;
  activityActions?: ActivityActions;
  onContinue?: (runId: string) => void;
}) {
  const sources = useMemo(
    () => ({
      workspaceId,
      openIn: isSidebar ? ("main" as const) : ("sidepanel" as const),
    }),
    [workspaceId, isSidebar],
  );
  return (
    <ChatSourceContext.Provider value={sources}>
      <div
        className={`relative flex-1 ${isSidebar ? "" : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"}`}
      >
        <MessageScrollerContent className="flex h-auto min-h-0 flex-col gap-8 p-4">
          {messages.map((message) => (
            <MessageScrollerItem
              key={message.id}
              messageId={message.id}
              className="[content-visibility:visible]"
            >
              <Message from={message.role}>
                {message.role === "assistant" ? (
                  <AssistantMessage
                    message={message}
                    workspaceId={workspaceId}
                    active={streaming && message === messages.at(-1)}
                    pendingLabel={pendingLabel}
                    activities={activityByMessage?.[message.id]}
                    activityActions={activityActions}
                    onRetry={message === messages.at(-1) ? onRetry : undefined}
                    onContinue={message === messages.at(-1) ? onContinue : undefined}
                  />
                ) : (
                  <MessageContent>
                    <MessageSources text={message.text} roots={message.roots} />
                  </MessageContent>
                )}
              </Message>
            </MessageScrollerItem>
          ))}
        </MessageScrollerContent>
      </div>
    </ChatSourceContext.Provider>
  );
}

function AssistantMessage({
  message,
  workspaceId,
  active,
  pendingLabel,
  activities,
  activityActions,
  onRetry,
  onContinue,
}: {
  message: ChatMessage;
  workspaceId: string | null;
  active: boolean;
  pendingLabel?: string;
  activities?: readonly AgentActivity[];
  activityActions?: ActivityActions;
  onRetry?: () => void;
  onContinue?: (runId: string) => void;
}) {
  const displayText = chatDisplayText(message.text);
  const { text, isSmoothing } = useSmoothText(
    message.text,
    active,
    !active && message.status !== "completed",
  );
  const rendering = active || isSmoothing;
  const hasActiveActivity =
    (active && message.progress?.compaction?.status === "running") ||
    activities?.some(
      (activity) => activity.status === "running" || activity.status === "pending",
    ) ||
    (active && message.progress?.activities.some((activity) => activity.status === "running"));

  return (
    <>
      <MessageContent data-ai-streaming={rendering || undefined}>
        {!activities && <ReadActivity message={message} active={active} />}
        {!!activities?.length && (
          <Suspense fallback={<MessageThinking label="Loading activity" />}>
            <LazyMessageActivity activities={activities} actions={activityActions} />
          </Suspense>
        )}
        {rendering && !text ? (
          !hasActiveActivity && <MessageThinking label={pendingLabel} />
        ) : (
          <MessageSources
            text={text}
            manifest={message.context?.manifest ?? []}
            isAnimating={rendering}
          />
        )}

        {!!message.context?.omissions.length && !rendering && (
          <p className="text-xs text-content-secondary">{message.context.omissions.join(" ")}</p>
        )}
        {!rendering &&
          message.status === "completed" &&
          message.runId &&
          message.progress?.canContinue &&
          onContinue && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onContinue(message.runId!)}
            >
              Continue reading
            </Button>
          )}
      </MessageContent>
      {displayText && !rendering && <MessageActions text={displayText} onRetry={onRetry} />}
      {workspaceId && (
        <Suspense fallback={null}>
          <LazyRunDebugger workspaceId={workspaceId} message={message} />
        </Suspense>
      )}
    </>
  );
}
