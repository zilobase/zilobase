"use client";

import { toApiUrl } from "@/features/desktop/network/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  FileTextIcon,
  InboxIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/shared/components/icons";
import {
  buildPageEditSnapshotMap,
  getAgentToolDescriptor,
  isAgentProgressPart,
  isProposePageContentUpdateToolName,
  readAgentCitations,
  readAgentResultTable,
  readDatabaseConfigToolIds,
  type AgentProgressSnapshot,
  type AiChatFeedback,
  type PageEditSnapshotPart,
  type ProposePageContentUpdateOutput,
} from "@zilobase/features/ai-chat";
import { getToolName, isToolUIPart, type ChatStatus, type UIMessage } from "ai";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AgentActionReviews } from "./agent-action-review";
import { AgentResourceBadges } from "./agent-resource-badges";
import { AgentResultTable } from "./agent-result-table";
import {
  AgentProgressOnlyTask,
  AgentToolTaskGroup,
  buildMessagePartGroups,
} from "./agent-tool-task";
import { resolveAgentToolPresentation } from "./agent-tool-presentation";
import { Conversation, ConversationContent } from "./conversation";
import { DatabaseToolStepsGroup } from "./database-tool-steps";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "./message";
import { PageEditCard } from "./page-edit-card";
import { Shimmer } from "./shimmer";
import type { ToolPart } from "./tool";
import { pendingPhrases } from "../../model/chat-runtime-model";
import { shouldShowPendingAssistant } from "../../model/chat-message-visibility";

const PendingAssistantStatus = ({ status }: { status: ChatStatus }) => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrase = status === "submitted"
    ? "Preparing context"
    : pendingPhrases[phraseIndex % pendingPhrases.length];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhraseIndex((index) => (index + 1) % pendingPhrases.length);
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Message from="assistant">
      <MessageContent>
        <div className="not-prose flex w-fit max-w-full items-center gap-2 text-content-secondary">
          <SparklesIcon aria-hidden="true" className="size-4 shrink-0" />
          <Shimmer
            as="span"
            className="truncate font-medium text-sm"
            duration={1.25}
            spread={1.1}
          >
            {phrase}
          </Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
};

const PageEditToolPart = ({
  isApplying,
  isBaselineCurrent,
  isDiffVisible,
  isReviewAvailable,
  onApply,
  onDiscard,
  onToggleChanges,
  onUndo,
  part,
  snapshot,
}: {
  isApplying: boolean;
  isBaselineCurrent: boolean;
  isDiffVisible: boolean;
  isReviewAvailable: boolean;
  onApply: (toolCallId: string) => void | Promise<void>;
  onDiscard: (toolCallId: string) => void | Promise<void>;
  onToggleChanges: (toolCallId: string) => void;
  onUndo: (toolCallId: string) => void | Promise<void>;
  part: ToolPart;
  snapshot: PageEditSnapshotPart | null;
}) => {
  const output = part.output as ProposePageContentUpdateOutput | undefined;
  const summary =
    output?.summary ??
    (typeof part.input === "object" &&
    part.input &&
    "summary" in part.input &&
    typeof part.input.summary === "string"
      ? part.input.summary
      : "Updated the page in page context.");
  const toolError =
    part.state === "output-error" || part.errorText
      ? (part.errorText ?? "The page update tool failed.")
      : null;

  if (
    part.state !== "output-available" &&
    part.state !== "output-error" &&
    !snapshot &&
    !isApplying
  ) {
    return null;
  }

  return (
    <PageEditCard
      isApplying={isApplying}
      isBaselineCurrent={isBaselineCurrent}
      isDiffVisible={isDiffVisible}
      isReviewAvailable={isReviewAvailable}
      onApply={() => onApply(part.toolCallId)}
      onDiscard={() => onDiscard(part.toolCallId)}
      onToggleChanges={() => onToggleChanges(part.toolCallId)}
      onUndo={() => onUndo(part.toolCallId)}
      snapshot={snapshot}
      summary={summary}
      toolError={toolError}
    />
  );
};

function collectMessageCitations(message: UIMessage) {
  const citations = message.parts.flatMap((part) => {
    if (!isToolUIPart(part)) {
      return [];
    }

    const explicitCitations = readAgentCitations(part.output);

    if (explicitCitations.length > 0) {
      return explicitCitations;
    }

    const toolName = getToolName(part);
    const ids = readDatabaseConfigToolIds(part.output);
    const input =
      part.input && typeof part.input === "object" && !Array.isArray(part.input)
        ? (part.input as Record<string, unknown>)
        : null;

    if (toolName === "createPage" && ids?.pageId) {
      return [{
        id: ids.pageId,
        source: "page" as const,
        title:
          typeof input?.name === "string" && input.name.trim()
            ? input.name.trim()
            : "Created page",
        url: `/p/${encodeURIComponent(ids.pageId)}`,
      }];
    }

    if (toolName === "createDatabase" && ids?.databaseId) {
      return [{
        id: ids.databaseId,
        source: "database" as const,
        title:
          typeof input?.name === "string" && input.name.trim()
            ? input.name.trim()
            : "Created database",
        url: `/d/${encodeURIComponent(ids.databaseId)}`,
      }];
    }

    if (toolName === "createDatabaseRow" && ids?.rowPageId) {
      return [{
        id: ids.rowPageId,
        source: "page" as const,
        title:
          typeof input?.title === "string" && input.title.trim()
            ? input.title.trim()
            : "Created database page",
        url: `/p/${encodeURIComponent(ids.rowPageId)}`,
      }];
    }

    return [];
  });
  const seen = new Set<string>();

  return citations.filter((citation) => {
    const key = `${citation.source}:${citation.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

const AssistantFeedback = ({
  isPending,
  onSubmit,
  rating,
}: {
  isPending: boolean;
  onSubmit: (rating: -1 | 1, reason?: string) => void | Promise<void>;
  rating?: -1 | 1;
}) => {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  const submitNegative = useCallback(async () => {
    await onSubmit(-1, reason.trim() || undefined);
    setShowReason(false);
    setReason("");
  }, [onSubmit, reason]);

  return (
    <div className="not-prose mt-1 grid w-fit gap-2">
      <MessageActions className="opacity-70 transition-opacity hover:opacity-100">
        <MessageAction
          aria-pressed={rating === 1}
          disabled={isPending}
          label="Helpful response"
          onClick={() => void onSubmit(1)}
          tooltip="Helpful"
          variant={rating === 1 ? "secondary" : "ghost"}
        >
          <ThumbsUpIcon className="size-3.5" />
        </MessageAction>
        <MessageAction
          aria-pressed={rating === -1}
          disabled={isPending}
          label="Unhelpful response"
          onClick={() => setShowReason(true)}
          tooltip="Not helpful"
          variant={rating === -1 ? "secondary" : "ghost"}
        >
          <ThumbsDownIcon className="size-3.5" />
        </MessageAction>
      </MessageActions>
      {showReason ? (
        <div className="flex max-w-md items-center gap-2">
          <Input
            aria-label="Optional feedback reason"
            autoFocus
            className="h-8 text-xs"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submitNegative();
              if (event.key === "Escape") setShowReason(false);
            }}
            placeholder="What could be better? (optional)"
            value={reason}
          />
          <Button
            disabled={isPending}
            onClick={() => void submitNegative()}
            size="sm"
            type="button"
          >
            Send
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const ChatMessage = ({
  applyingToolCallIds,
  getPageEditBaselineCurrent,
  getPageEditReviewAvailable,
  isSidebar,
  message,
  feedbackRating,
  feedbackPending,
  showFeedback,
  onApplyPageEdit,
  onDiscardPageEdit,
  onRetryIncompleteDatabase,
  onTogglePageEditChanges,
  onUndoPageEdit,
  onSubmitFeedback,
  snapshotByToolCallId,
  threadId,
  visibleDiffToolCallId,
  workspaceId,
}: {
  applyingToolCallIds: readonly string[];
  getPageEditBaselineCurrent: (snapshot: PageEditSnapshotPart) => boolean;
  getPageEditReviewAvailable: (snapshot: PageEditSnapshotPart) => boolean;
  isSidebar: boolean;
  message: UIMessage;
  feedbackRating?: -1 | 1;
  feedbackPending: boolean;
  showFeedback: boolean;
  onApplyPageEdit: (toolCallId: string) => void | Promise<void>;
  onDiscardPageEdit: (toolCallId: string) => void | Promise<void>;
  onRetryIncompleteDatabase: (prompt: string) => void | Promise<void>;
  onTogglePageEditChanges: (toolCallId: string) => void;
  onUndoPageEdit: (toolCallId: string) => void | Promise<void>;
  onSubmitFeedback: (
    messageId: string,
    rating: -1 | 1,
    reason?: string,
  ) => void | Promise<void>;
  snapshotByToolCallId: Map<string, PageEditSnapshotPart>;
  threadId: string | null;
  visibleDiffToolCallId: string | null;
  workspaceId: string | null;
}) => {
  if (message.role === "system" || (message.role as string) === "data") {
    return null;
  }

  const partGroups = buildMessagePartGroups(message.parts);
  const progressByToolCallId = new Map<string, AgentProgressSnapshot>(
    message.parts.flatMap((part) =>
      isAgentProgressPart(part)
        ? [[part.data.toolCallId, part.data] as const]
        : [],
    ),
  );
  const citations = collectMessageCitations(message);
  const tables = message.parts.flatMap((part) => {
    if (!isToolUIPart(part)) return [];
    const table = readAgentResultTable(part.output);
    return table ? [{ table, toolCallId: part.toolCallId }] : [];
  });

  return (
    <Message from={message.role}>
      <MessageContent>
        {partGroups.map((group) => {
          if (group.type === "database-tools") {
            return (
              <DatabaseToolStepsGroup
                key={`${message.id}-db-${group.startIndex}`}
                onRetryIncomplete={onRetryIncompleteDatabase}
                parts={group.parts}
                progressByToolCallId={progressByToolCallId}
              />
            );
          }

          if (group.type === "agent-tools") {
            return (
              <AgentToolTaskGroup
                getToolPresentation={(part, toolName) =>
                  resolveAgentToolPresentation({
                    part,
                    title: getAgentToolDescriptor(toolName)?.title,
                    toolName,
                  })
                }
                key={`${message.id}-agent-${group.startIndex}`}
                parts={group.parts}
                progressByToolCallId={progressByToolCallId}
              />
            );
          }

          const { index, part } = group;

          if (part.type === "text") {
            return (
              <MessageResponse key={`${message.id}-${index}`}>
                {part.text}
              </MessageResponse>
            );
          }

          if (part.type === "reasoning") {
            return null;
          }

          if (isAgentProgressPart(part)) {
            const hasMatchingToolPart = message.parts.some(
              (candidate) =>
                isToolUIPart(candidate) &&
                candidate.toolCallId === part.data.toolCallId,
            );
            return hasMatchingToolPart
              ? null
              : (
                  <AgentProgressOnlyTask
                    key={`${message.id}-progress-${part.data.toolCallId}`}
                    progress={part.data}
                  />
                );
          }

          if (part.type === "file") {
            return (
              <a
                className="not-prose flex w-fit max-w-full items-center gap-2 rounded-md border bg-surface-canvas px-2.5 py-2 text-xs hover:bg-action-neutral-hover"
                href={toApiUrl(part.url)}
                key={`${message.id}-${index}`}
                rel="noreferrer"
                target="_blank"
              >
                <FileTextIcon className="size-4 shrink-0 text-content-secondary" />
                <span className="truncate">{part.filename ?? "Attached file"}</span>
              </a>
            );
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);

            if (isProposePageContentUpdateToolName(toolName)) {
              const snapshot =
                snapshotByToolCallId.get(part.toolCallId) ?? null;

              return (
                <PageEditToolPart
                  isApplying={
                    applyingToolCallIds.includes(part.toolCallId) &&
                    !snapshotByToolCallId.has(part.toolCallId)
                  }
                  isBaselineCurrent={
                    snapshot ? getPageEditBaselineCurrent(snapshot) : false
                  }
                  isDiffVisible={visibleDiffToolCallId === part.toolCallId}
                  isReviewAvailable={
                    snapshot ? getPageEditReviewAvailable(snapshot) : false
                  }
                  key={`${message.id}-${index}`}
                  onApply={onApplyPageEdit}
                  onDiscard={onDiscardPageEdit}
                  onToggleChanges={onTogglePageEditChanges}
                  onUndo={onUndoPageEdit}
                  part={part}
                  snapshot={snapshot}
                />
              );
            }

            return null;
          }

          return null;
        })}
        {tables.map(({ table, toolCallId }) => (
          <AgentResultTable key={toolCallId} table={table} />
        ))}
        {threadId && workspaceId ? (
          <AgentActionReviews
            message={message}
            threadId={threadId}
            workspaceId={workspaceId}
          />
        ) : null}
        <AgentResourceBadges
          citations={citations}
          openInMainPage={isSidebar}
        />
        {message.role === "assistant" && showFeedback ? (
          <AssistantFeedback
            isPending={feedbackPending}
            onSubmit={(rating, reason) =>
              onSubmitFeedback(message.id, rating, reason)
            }
            rating={feedbackRating}
          />
        ) : null}
      </MessageContent>
    </Message>
  );
};

const EmptyState = ({
  isSidebar,
  onSuggestion,
}: {
  isSidebar: boolean;
  onSuggestion: (value: string) => void;
}) => (
  <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-5 px-4 pb-6 text-center">
    <div className="flex size-12 items-center justify-center rounded-md border bg-surface-canvas shadow-sm">
      <InboxIcon className="size-6 text-content-secondary" />
    </div>
    <div className="space-y-2">
      <h2 className="font-semibold text-xl">
        {isSidebar ? "What should I do with this page?" : "What can I help you build?"}
      </h2>
      <p className="mx-auto max-w-xl text-content-secondary text-sm">
        Describe the outcome in ordinary language. Ask AI will infer the setup,
        use your workspace context, and complete the supported steps.
      </p>
    </div>
    <div className="flex max-w-2xl flex-wrap justify-center gap-2">
      {(isSidebar
        ? [
            "Summarize this page and list open questions",
            "Turn this page into an action plan",
            "Find related pages in this workspace",
          ]
        : [
            "Find the latest decisions in this workspace",
            "Create a 1:1 meeting notes database with useful properties and a This week view",
            "Analyze an uploaded file and show the key trends",
          ]
      ).map((suggestion) => (
        <Button
          key={suggestion}
          onClick={() => onSuggestion(suggestion)}
          size="sm"
          type="button"
          variant="outline"
        >
          {suggestion}
        </Button>
      ))}
    </div>
  </div>
);

type ChatbotMessagesProps = {
  applyingToolCallIds: readonly string[];
  debuggerContent?: ReactNode;
  feedbackByMessageId: ReadonlyMap<string, AiChatFeedback>;
  feedbackPendingMessageId?: string;
  feedbackReadyMessageIds: ReadonlySet<string>;
  getPageEditBaselineCurrent: (snapshot: PageEditSnapshotPart) => boolean;
  getPageEditReviewAvailable: (snapshot: PageEditSnapshotPart) => boolean;
  isSidebar: boolean;
  messages: UIMessage[];
  onApplyPageEdit: (toolCallId: string) => void | Promise<void>;
  onDiscardPageEdit: (toolCallId: string) => void | Promise<void>;
  onRetryIncompleteDatabase: (prompt: string) => void | Promise<void>;
  onSubmitFeedback: (messageId: string, rating: -1 | 1, reason?: string) => void | Promise<void>;
  onSuggestion: (value: string) => void;
  onTogglePageEditChanges: (toolCallId: string) => void;
  onUndoPageEdit: (toolCallId: string) => void | Promise<void>;
  snapshotByToolCallId: ReturnType<typeof buildPageEditSnapshotMap>;
  status: ChatStatus;
  threadId: string | null;
  visibleDiffToolCallId: string | null;
  visibleMessages: UIMessage[];
  workspaceId: string | null;
};

export const ChatbotMessages = ({
  applyingToolCallIds,
  debuggerContent,
  feedbackByMessageId,
  feedbackPendingMessageId,
  feedbackReadyMessageIds,
  getPageEditBaselineCurrent,
  getPageEditReviewAvailable,
  isSidebar,
  messages,
  onApplyPageEdit,
  onDiscardPageEdit,
  onRetryIncompleteDatabase,
  onSubmitFeedback,
  onSuggestion,
  onTogglePageEditChanges,
  onUndoPageEdit,
  snapshotByToolCallId,
  status,
  threadId,
  visibleDiffToolCallId,
  visibleMessages,
  workspaceId,
}: ChatbotMessagesProps) => {
  const hasMessages = visibleMessages.length > 0;

  return (
    <Conversation className={isSidebar ? "min-h-0" : "flex-none overflow-visible"}>
      <ConversationContent
        className={hasMessages || isSidebar ? "px-0 pb-10 md:px-4" : "px-0 pb-0 md:px-4"}
        scrollClassName={isSidebar ? undefined : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"}
      >
        {!hasMessages ? (
          <EmptyState isSidebar={isSidebar} onSuggestion={onSuggestion} />
        ) : (
          visibleMessages.map((message) => (
            <ChatMessage
              applyingToolCallIds={applyingToolCallIds}
              feedbackPending={feedbackPendingMessageId === message.id}
              feedbackRating={feedbackByMessageId.get(message.id)?.rating}
              getPageEditBaselineCurrent={getPageEditBaselineCurrent}
              getPageEditReviewAvailable={getPageEditReviewAvailable}
              isSidebar={isSidebar}
              key={message.id}
              message={message}
              onApplyPageEdit={onApplyPageEdit}
              onDiscardPageEdit={onDiscardPageEdit}
              onRetryIncompleteDatabase={onRetryIncompleteDatabase}
              onSubmitFeedback={onSubmitFeedback}
              onTogglePageEditChanges={onTogglePageEditChanges}
              onUndoPageEdit={onUndoPageEdit}
              showFeedback={feedbackReadyMessageIds.has(message.id)}
              snapshotByToolCallId={snapshotByToolCallId}
              threadId={threadId}
              visibleDiffToolCallId={visibleDiffToolCallId}
              workspaceId={workspaceId}
            />
          ))
        )}
        {debuggerContent}
        {shouldShowPendingAssistant(messages, status) ? (
          <PendingAssistantStatus status={status} />
        ) : null}
      </ConversationContent>
    </Conversation>
  );
};
