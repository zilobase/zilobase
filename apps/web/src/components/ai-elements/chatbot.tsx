"use client";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { ContextAttachChips } from "@/components/ai-elements/context-attach-chips";
import {
  buildPrimaryAttachment,
  ContextAttachMenu,
  getAttachmentKey,
  parseMentionState,
  type ContextAttachMenuEntry,
  type ContextAttachMenuHandle,
} from "@/components/ai-elements/context-attach-menu";
import { usePageEditorRegistry } from "@/contexts/page-editor-registry";
import { useOptionalPageSidePane } from "@/contexts/page-side-pane";
import { usePageAiContext } from "@/hooks/use-page-ai-context";
import { useDatabaseEmbedAutoApply } from "@/hooks/use-database-embed-auto-apply";
import { useDatabaseToolCacheSync } from "@/hooks/use-database-tool-cache-sync";
import { useAgentConversation } from "@/hooks/use-agent-conversation";
import {
  updatePageEditSnapshotStatus,
  usePageEditAutoApply,
} from "@/hooks/use-page-edit-auto-apply";
import { usePageEditApplier } from "@/hooks/use-page-edit-applier";
import { DatabaseToolStepsGroup } from "@/components/ai-elements/database-tool-steps";
import {
  AgentToolTaskGroup,
  buildMessagePartGroups,
} from "@/components/ai-elements/agent-tool-task";
import { resolveAgentToolPresentation } from "@/components/ai-elements/agent-tool-presentation";
import { AgentActionReviews } from "@/components/ai-elements/agent-action-review";
import { PageEditCard } from "@/components/ai-elements/page-edit-card";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachments,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { ToolPart } from "@/components/ai-elements/tool";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  aiChatThreadMessagesQueryKey,
  aiChatThreadMessagesQueryOptions,
  aiChatThreadsQueryKey,
  buildPageEditSnapshotMap,
  dedupeChatMessagesById,
  isProposePageContentUpdateToolName,
  isPageEditBaselineCurrent,
  isPageEditReviewAvailable,
  logPageEdit,
  readAgentCitations,
  readAgentResultTable,
  readDatabaseConfigToolIds,
  getAgentToolDescriptor,
  type AgentCitation,
  type AiChatFeedback,
  type AiChatThreadMessagesResponse,
  type WorkspaceAiChatModel,
  type ProposePageContentUpdateOutput,
  type PageEditSnapshotPart,
  useCreateAiChatThread,
  useSubmitAiChatFeedback,
  useWorkspaceAiModels,
} from "@zilobase/features/ai-chat";
import { useSession } from "@zilobase/features/auth";
import { useZilobaseFeatures } from "@zilobase/features";
import { useDatabase } from "@zilobase/features/databases";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces";
import { usePageAccessLevel, usePageNavigation } from "@zilobase/features/pages";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toApiUrl } from "@/lib/api";
import {
  type ChatStatus,
  type UIMessage,
  getToolName,
  isToolUIPart,
} from "ai";
import {
  extractPageMarkdownFromContext,
  logPageContextSent,
  logPageContextRebuild,
  prosemirrorToMarkdown,
  type ContextAttachment,
  type ContextSourceRef,
} from "@zilobase/page-context";
import {
  ArrowDownIcon,
  CheckIcon,
  FileTextIcon,
  InboxIcon,
  PlusIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/shared/components/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentResultTable } from "@/components/ai-elements/agent-result-table";
import { getAgentCitationSidePaneTarget } from "@/components/ai-elements/agent-citation-navigation";
import {
  AI_FILE_ACCEPT,
  MAX_AI_FILE_BYTES,
  MAX_AI_FILES,
  uploadAiChatFile,
} from "@/lib/ai-file-upload";

const fallbackModels: WorkspaceAiChatModel[] = [
  {
    chef: "Zilobase",
    chefSlug: "openai",
    description: "Automatically uses the workspace default model.",
    gatewayId: "auto",
    id: "auto",
    name: "Auto",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-4o-mini",
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-4o",
    id: "gpt-4o",
    name: "GPT-4o",
    providers: ["openai"],
  },
];

function areMessagesEquivalent(
  leftMessages: UIMessage[],
  rightMessages: UIMessage[],
) {
  if (leftMessages === rightMessages) {
    return true;
  }

  if (leftMessages.length !== rightMessages.length) {
    return false;
  }

  return leftMessages.every((leftMessage, index) => {
    const rightMessage = rightMessages[index];

    if (
      leftMessage === rightMessage ||
      (leftMessage.id === rightMessage.id &&
        leftMessage.role === rightMessage.role &&
        leftMessage.parts === rightMessage.parts)
    ) {
      return true;
    }

    return JSON.stringify(leftMessage) === JSON.stringify(rightMessage);
  });
}

const emptyAgentChatMessages: UIMessage[] = [];

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      cause: error.cause,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: typeof error,
  };
}

function summarizeMessagesForDebug(messages: UIMessage[]) {
  const lastMessage = messages.at(-1);

  return {
    count: messages.length,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          partTypes: lastMessage.parts.map((part) => part.type),
          role: lastMessage.role,
        }
      : null,
    roles: messages.map((message) => message.role),
  };
}

function logAiChatError(
  source: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  const errorDetails = getErrorDetails(error);

  console.groupCollapsed(
    `[zilobase ai chat] ${source}: ${errorDetails.message}`,
  );
  console.error(error);
  console.info("error details", errorDetails);
  console.info("context", context);
  console.groupEnd();
}

const pendingPhrases = [
  "Thinking through your question",
  "Analyzing page context",
  "Searching your workspace",
  "Preparing tool calls",
];

const providerLogoSlugs: Record<string, string> = {
  fireworks: "fireworks-ai",
  "google-ai-studio": "google",
  together: "togetherai",
};

function getProviderLogoSlug(provider: string) {
  return providerLogoSlugs[provider] ?? provider;
}

const ShellScrollButton = ({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const scrollShell = targetRef.current?.closest(
      "[data-ai-scroll-shell]",
    ) as HTMLElement | null;

    if (!scrollShell) {
      return;
    }

    const updateVisibility = () => {
      const distanceFromBottom =
        scrollShell.scrollHeight -
        scrollShell.scrollTop -
        scrollShell.clientHeight;

      setIsVisible(distanceFromBottom > 160);
    };

    updateVisibility();
    scrollShell.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      scrollShell.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [targetRef]);

  const handleClick = useCallback(() => {
    const scrollShell = targetRef.current?.closest(
      "[data-ai-scroll-shell]",
    ) as HTMLElement | null;

    scrollShell?.scrollTo({
      behavior: "smooth",
      top: scrollShell.scrollHeight,
    });
  }, [targetRef]);

  if (!isVisible) {
    return null;
  }

  return (
    <Button
      className="absolute top-3 left-1/2 z-20 size-8 -translate-x-1/2 -translate-y-full rounded-full bg-background shadow-sm"
      onClick={handleClick}
      size="icon"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon className="size-4" />
      <span className="sr-only">Scroll to bottom</span>
    </Button>
  );
};

const ModelItem = ({
  m,
  isSelected,
  onSelect,
}: {
  m: WorkspaceAiChatModel;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const handleSelect = useCallback(() => {
    onSelect(m.id);
  }, [onSelect, m.id]);

  return (
    <ModelSelectorItem
      onSelect={handleSelect}
      title={m.description}
      value={m.id}
    >
      <ModelSelectorLogo provider={getProviderLogoSlug(m.chefSlug)} />
      <ModelSelectorName>{m.name}</ModelSelectorName>
      <ModelSelectorLogoGroup>
        {m.providers.map((provider) => (
          <ModelSelectorLogo
            key={provider}
            provider={getProviderLogoSlug(provider)}
          />
        ))}
      </ModelSelectorLogoGroup>
      {isSelected ? (
        <CheckIcon className="ml-auto size-4" />
      ) : (
        <div className="ml-auto size-4" />
      )}
    </ModelSelectorItem>
  );
};

const PendingAssistantStatus = () => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrase = pendingPhrases[phraseIndex % pendingPhrases.length];

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
        <div className="not-prose flex w-fit max-w-full items-center gap-2 text-muted-foreground">
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

function shouldShowPendingAssistant(messages: UIMessage[], status: ChatStatus) {
  if (!(status === "submitted" || status === "streaming")) {
    return false;
  }

  const lastMessage = messages.at(-1);

  if (!lastMessage) {
    return true;
  }

  if (lastMessage.role !== "assistant") {
    return true;
  }

  return !lastMessage.parts.some(
    (part) => part.type === "text" || isToolUIPart(part),
  );
}

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

const AgentCitations = ({
  citations,
  openInMainPage,
}: {
  citations: AgentCitation[];
  openInMainPage: boolean;
}) => {
  const navigate = useNavigate();
  const sidePane = useOptionalPageSidePane();

  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="not-prose mt-3 flex flex-wrap gap-2" aria-label="Sources">
      {citations.map((citation) => {
        const external = citation.url.startsWith("https://");
        const href = citation.url.startsWith("/api/")
          ? toApiUrl(citation.url)
          : citation.url;
        const sidePaneTarget = getAgentCitationSidePaneTarget(citation);

        return (
          <a
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            href={href}
            key={`${citation.source}:${citation.id}`}
            onClick={(event) => {
              if (
                !sidePaneTarget ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              event.preventDefault();

              if (openInMainPage) {
                if (sidePane) {
                  if (sidePaneTarget.type === "database") {
                    sidePane.openDatabaseInMainPane(sidePaneTarget.id);
                    return;
                  }

                  sidePane.openPageInMainPane(sidePaneTarget.id);
                  return;
                }

                if (sidePaneTarget.type === "database") {
                  void navigate({
                    params: { databaseId: sidePaneTarget.id },
                    search: { view: undefined },
                    to: "/d/$databaseId",
                  });
                  return;
                }

                void navigate({
                  params: { pageId: sidePaneTarget.id },
                  to: "/p/$pageId",
                });
                return;
              }

              if (!sidePane) {
                return;
              }

              if (sidePaneTarget.type === "database") {
                sidePane.openDatabaseSidePane(sidePaneTarget.id);
                return;
              }

              sidePane.openSidePane(sidePaneTarget.id);
            }}
            rel={external ? "noreferrer" : undefined}
            target={external ? "_blank" : undefined}
            title={citation.excerpt ?? citation.title}
          >
            <FileTextIcon className="size-3.5 shrink-0" />
            <span className="truncate">{citation.title}</span>
          </a>
        );
      })}
    </div>
  );
};

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
  onApplyPageEdit,
  onDiscardPageEdit,
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
  onApplyPageEdit: (toolCallId: string) => void | Promise<void>;
  onDiscardPageEdit: (toolCallId: string) => void | Promise<void>;
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
                parts={group.parts}
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

          if (part.type === "file") {
            return (
              <a
                className="not-prose flex w-fit max-w-full items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-xs hover:bg-accent"
                href={toApiUrl(part.url)}
                key={`${message.id}-${index}`}
                rel="noreferrer"
                target="_blank"
              >
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
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
        <AgentCitations
          citations={citations}
          openInMainPage={isSidebar}
        />
        {message.role === "assistant" ? (
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
    <div className="flex size-12 items-center justify-center rounded-md border bg-background shadow-sm">
      <InboxIcon className="size-6 text-muted-foreground" />
    </div>
    <div className="space-y-2">
      <h2 className="font-semibold text-xl">Ask AI about your page</h2>
      <p className="mx-auto max-w-xl text-muted-foreground text-sm">
        Search accessible Zilobase pages and databases, use attached context,
        analyze uploaded files, create downloads, and complete supported actions.
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
            "Create a project tracker with owners and status",
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

type ChatbotProps = {
  databaseId?: string | null;
  isSidebar?: boolean;
  onThreadCreated?: (threadId: string) => void;
  threadId: string | null;
  pageId?: string | null;
};

type SeededInitialMessages = {
  key: string;
  messages: UIMessage[];
  ready: boolean;
};

const Chatbot = (props: ChatbotProps) => {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  const threadMessagesQuery = useQuery(
    aiChatThreadMessagesQueryOptions(apiFetch, workspaceId, props.threadId),
  );
  const initialMessagesKey = `${workspaceId ?? "no-workspace"}:${props.threadId}`;
  const queriedInitialMessages =
    threadMessagesQuery.data?.messages ?? emptyAgentChatMessages;
  const queriedInitialFeedback = threadMessagesQuery.data?.feedback ?? [];
  const [seededInitialMessages, setSeededInitialMessages] =
    useState<SeededInitialMessages>(() => ({
      key: initialMessagesKey,
      messages: emptyAgentChatMessages,
      ready: false,
    }));

  useEffect(() => {
    if (threadMessagesQuery.isLoading) {
      return;
    }

    setSeededInitialMessages((current) => {
      if (current.ready && current.key === initialMessagesKey) {
        return current;
      }

      return {
        key: initialMessagesKey,
        messages: queriedInitialMessages,
        ready: true,
      };
    });
  }, [
    initialMessagesKey,
    queriedInitialMessages,
    threadMessagesQuery.isLoading,
  ]);

  if (!props.threadId) {
    return (
      <ChatbotInner
        {...props}
        initialMessages={emptyAgentChatMessages}
        initialFeedback={[]}
        key={initialMessagesKey}
      />
    );
  }

  if (
    threadMessagesQuery.isLoading ||
    !seededInitialMessages.ready ||
    seededInitialMessages.key !== initialMessagesKey
  ) {
    return (
      <div className="flex min-h-40 items-center justify-center text-muted-foreground text-sm">
        Loading chat...
      </div>
    );
  }

  return (
    <ChatbotInner
      {...props}
      initialMessages={seededInitialMessages.messages}
      initialFeedback={queriedInitialFeedback}
      key={initialMessagesKey}
    />
  );
};

const ChatbotInner = ({
  databaseId = null,
  initialFeedback,
  initialMessages,
  isSidebar = false,
  onThreadCreated,
  threadId,
  pageId = null,
}: ChatbotProps & {
  initialFeedback: AiChatFeedback[];
  initialMessages: UIMessage[];
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const threadCreationPromiseRef = useRef<Promise<string> | null>(null);
  const [model, setModel] = useState<string>("auto");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [text, setText] = useState<string>("");
  const [textCursor, setTextCursor] = useState(0);
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [primaryDismissed, setPrimaryDismissed] = useState(false);
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(
    null,
  );
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [mentionMenuEntries, setMentionMenuEntries] = useState<
    ContextAttachMenuEntry[]
  >([]);
  const mentionMenuRef = useRef<ContextAttachMenuHandle | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceId = useActiveWorkspaceId();
  const primarySource = useMemo<ContextSourceRef | null>(() => {
    if (pageId) {
      return { type: "page", id: pageId, role: "primary" };
    }

    if (databaseId) {
      return { type: "database", id: databaseId, role: "primary" };
    }

    return null;
  }, [databaseId, pageId]);
  const effectivePrimarySource = primaryDismissed ? null : primarySource;
  const { data: navigation } = usePageNavigation(workspaceId, {
    enabled: isSidebar && Boolean(workspaceId),
  });
  const pages = navigation?.pages ?? [];
  const { data: pageAccessLevel } = usePageAccessLevel(
    isSidebar ? pageId : null,
    {
      refetchOnMount: false,
    },
  );
  const { data: databasePayload } = useDatabase(databaseId);
  const primaryAttachment = useMemo(() => {
    if (!effectivePrimarySource) {
      return null;
    }

    const databaseConfig = databasePayload?.database.config;
    const databaseEmoji =
      databaseConfig &&
      typeof databaseConfig === "object" &&
      !Array.isArray(databaseConfig) &&
      typeof (databaseConfig as { emoji?: unknown }).emoji === "string"
        ? (databaseConfig as { emoji: string }).emoji
        : null;

    return (
      buildPrimaryAttachment({
        databaseEmoji,
        databaseName: databasePayload?.database.name,
        databasePageId: databasePayload?.database.pageId,
        primarySource: effectivePrimarySource,
        pages,
        placements: navigation?.placements ?? [],
      }) ?? {
        emoji: databaseEmoji,
        id: effectivePrimarySource.id,
        path: "",
        title:
          effectivePrimarySource.type === "database"
            ? databasePayload?.database.name?.trim() || "Database"
            : "Current page",
        type: effectivePrimarySource.type,
      }
    );
  }, [databasePayload, effectivePrimarySource, navigation?.placements, pages]);
  const {
    error: contextError,
    isLoading: isContextLoading,
    markdown: pageContext,
  } = usePageAiContext({
    attachments,
    enabled: isSidebar && Boolean(workspaceId),
    workspaceId,
    primarySource: effectivePrimarySource,
  });
  const aiModelsQuery = useWorkspaceAiModels();
  const models = useMemo(() => {
    const queryModels = aiModelsQuery.data?.models ?? [];

    return queryModels.length ? queryModels : fallbackModels;
  }, [aiModelsQuery.data?.models]);
  const selectedModelData = useMemo(
    () => models.find((m) => m.id === model),
    [models, model],
  );
  const chefs = useMemo(
    () => Array.from(new Set(models.map((item) => item.chef))),
    [models],
  );

  useEffect(() => {
    setModel((current) =>
      models.some((item) => item.id === current) ? current : models[0].id,
    );
  }, [models]);

  useEffect(() => {
    setAttachments([]);
    setDismissedMentionKey(null);
    setPrimaryDismissed(false);
    setSelectedMentionIndex(0);
    setTextCursor(0);
  }, [databaseId, pageId]);

  const mentionTrigger = useMemo(
    () => parseMentionState(text, textCursor),
    [text, textCursor],
  );
  const mentionKey = mentionTrigger
    ? `${mentionTrigger.mentionStart}:${mentionTrigger.mentionQuery}`
    : null;
  const activeMentionTrigger =
    mentionTrigger && mentionKey !== dismissedMentionKey
      ? mentionTrigger
      : null;
  const mentionMenuOpen = Boolean(activeMentionTrigger);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [activeMentionTrigger?.mentionQuery]);

  useEffect(() => {
    if (!isSidebar || isContextLoading) {
      return;
    }

    logPageContextRebuild({
      attachmentCount: attachments.length,
      charCount: pageContext.length,
      buildMs: 0,
    });
  }, [attachments.length, isContextLoading, isSidebar, pageContext]);

  const { queryClient } = useZilobaseFeatures();
  const createThread = useCreateAiChatThread();
  const submitFeedback = useSubmitAiChatFeedback();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const feedbackByMessageId = useMemo(
    () => new Map(initialFeedback.map((item) => [item.messageId, item])),
    [initialFeedback],
  );
  const isAgentReady = Boolean(workspaceId && userId && threadId);
  const isComposerReady = Boolean(workspaceId && userId);
  const agentName = isAgentReady
    ? `org-${workspaceId}-user-${userId}-thread-${threadId}`
    : "chat-not-ready";

  const { getEditorHandle } = usePageEditorRegistry();
  const { commitPageEdit, undoPageEdit } = usePageEditApplier();
  const [visibleDiffToolCallId, setVisibleDiffToolCallId] = useState<
    string | null
  >(null);

  const allowedPageIds = useMemo(() => {
    const ids = new Set<string>();

    if (effectivePrimarySource?.type === "page") {
      ids.add(effectivePrimarySource.id);
    }

    for (const attachment of attachments) {
      if (attachment.type === "page") {
        ids.add(attachment.id);
      }
    }

    return [...ids];
  }, [attachments, effectivePrimarySource]);

  const canApplyPageEdits = Boolean(
    isSidebar &&
    pageId &&
    (pageAccessLevel === "edit" || pageAccessLevel === "full"),
  );

  const buildChatRequestBody = useCallback(
    (
      requestThreadId: string | null,
      attachmentIds: string[] = [],
      clientTurnId = crypto.randomUUID(),
    ) => ({
      attachmentIds,
      clientTurnId,
      contextRefs: [
        ...(effectivePrimarySource
          ? [{
              id: effectivePrimarySource.id,
              role: "primary" as const,
              type: effectivePrimarySource.type,
            }]
          : []),
        ...attachments
          .filter((attachment) =>
            attachment.type === "page" || attachment.type === "database"
          )
          .map((attachment) => ({
            id: attachment.id,
            role: "attached" as const,
            type: attachment.type as "page" | "database",
          })),
      ],
      modelId: model,
      mentionedUserIds: attachments
        .filter((attachment) => attachment.type === "person")
        .map((attachment) => attachment.id),
      threadId: requestThreadId,
    }),
    [
      attachments,
      effectivePrimarySource,
      model,
    ],
  );

  const threadMessagesQueryKey = useMemo(
    () =>
      workspaceId && threadId
        ? aiChatThreadMessagesQueryKey(workspaceId, threadId)
        : null,
    [workspaceId, threadId],
  );

  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useAgentConversation({
    id: agentName,
    initialMessages,
    onError: (chatError) => {
      logAiChatError("useChat onError", chatError, {
        agentName,
        canApplyPageEdits,
        isAgentReady,
        isSidebar,
        workspaceId,
        threadId,
        userId,
        pageContextChars: pageContext.length,
        pageId,
      });
      toast.error("Ask AI failed", {
        description: chatError.message,
      });
    },
    threadId,
    workspaceId,
  });

  const debugContextRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    debugContextRef.current = {
      agentName,
      databaseId,
      isAgentReady,
      isSidebar,
      messageSummary: summarizeMessagesForDebug(messages),
      workspaceId,
      status,
      threadId,
      userId,
      pageContextChars: pageContext.length,
      pageId,
    };
  }, [
    agentName,
    databaseId,
    isAgentReady,
    isSidebar,
    messages,
    workspaceId,
    status,
    threadId,
    userId,
    pageContext.length,
    pageId,
  ]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      logAiChatError("window error", event.error ?? event.message, {
        ...debugContextRef.current,
        colno: event.colno,
        filename: event.filename,
        lineno: event.lineno,
        message: event.message,
      });
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logAiChatError(
        "unhandled rejection",
        event.reason,
        debugContextRef.current,
      );
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);

  useEffect(() => {
    setText("");
    setTextCursor(0);
    setAttachments([]);
    setPrimaryDismissed(false);
    setDismissedMentionKey(null);
    setSelectedMentionIndex(0);
    setMentionMenuEntries([]);
    setVisibleDiffToolCallId(null);
    previousMessageCountRef.current = 0;
  }, [threadId]);

  useEffect(() => {
    if (!isSidebar) {
      return;
    }

    logPageEdit("chat:page-edit-config", {
      allowedPageIds,
      canApplyPageEdits,
      primaryPageId:
        effectivePrimarySource?.type === "page"
          ? effectivePrimarySource.id
          : null,
      pageAccessLevel: pageAccessLevel ?? null,
      pageContextChars: pageContext.length,
      pageId,
    });
  }, [
    allowedPageIds,
    canApplyPageEdits,
    effectivePrimarySource,
    isSidebar,
    pageAccessLevel,
    pageContext.length,
    pageId,
  ]);

  const getContextPageMarkdown = useCallback(
    (targetPageId: string) =>
      pageContext
        ? extractPageMarkdownFromContext(pageContext, targetPageId)
        : null,
    [pageContext],
  );

  const { applyingToolCallIds } = usePageEditAutoApply({
    enabled: isSidebar && canApplyPageEdits,
    getContextPageMarkdown,
    messages,
    setMessages,
  });

  useDatabaseToolCacheSync({
    enabled: isSidebar && canApplyPageEdits,
    messages,
  });

  useDatabaseEmbedAutoApply({
    enabled: isSidebar && canApplyPageEdits,
    messages,
  });

  const snapshotByToolCallId = useMemo(
    () => buildPageEditSnapshotMap(messages),
    [messages],
  );

  const visibleMessages = useMemo(
    () =>
      dedupeChatMessagesById(
        messages.filter(
          (message) => message.role === "user" || message.role === "assistant",
        ),
      ),
    [messages],
  );

  useEffect(() => {
    if (
      !threadMessagesQueryKey ||
      status === "submitted" ||
      status === "streaming" ||
      messages.length === 0
    ) {
      return;
    }

    queryClient.setQueryData<AiChatThreadMessagesResponse>(
      threadMessagesQueryKey,
      (current) => {
        if (!current) {
          return current;
        }

        if (areMessagesEquivalent(current.messages, messages)) {
          return current;
        }

        return { ...current, messages };
      },
    );
  }, [messages, queryClient, status, threadMessagesQueryKey]);

  const getPageEditBaselineCurrent = useCallback(
    (snapshot: PageEditSnapshotPart) => {
      const handle = getEditorHandle(snapshot.pageId);
      const currentContentJson = handle?.getContentJson() ?? null;

      return isPageEditBaselineCurrent(
        snapshot.beforeContentJson,
        currentContentJson,
        {
          baselineMarkdown: snapshot.beforeMarkdown,
          currentMarkdown: currentContentJson
            ? prosemirrorToMarkdown(currentContentJson)
            : undefined,
        },
      );
    },
    [getEditorHandle],
  );

  const getPageEditReviewAvailable = useCallback(
    (snapshot: PageEditSnapshotPart) => {
      const handle = getEditorHandle(snapshot.pageId);
      const currentContentJson = handle?.getContentJson() ?? null;

      return isPageEditReviewAvailable(
        snapshot,
        currentContentJson,
        currentContentJson
          ? prosemirrorToMarkdown(currentContentJson)
          : undefined,
      );
    },
    [getEditorHandle],
  );

  const handleDiscardPageEdit = useCallback(
    (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot || snapshot.status !== "preview") {
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "declined"),
      );
    },
    [getEditorHandle, setMessages, snapshotByToolCallId, visibleDiffToolCallId],
  );

  const handleApplyPageEdit = useCallback(
    async (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (
        !snapshot ||
        (snapshot.status !== "preview" && snapshot.status !== "undone")
      ) {
        return;
      }

      if (!getPageEditReviewAvailable(snapshot)) {
        toast.error("This update is no longer available", {
          description:
            "The page has changed since this suggestion was created.",
        });
        return;
      }

      const result = commitPageEdit({
        afterMarkdown: snapshot.afterMarkdown,
        pageId: snapshot.pageId,
      });

      if (!result.success) {
        toast.error("Apply failed", {
          description: result.errorMessage,
        });
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      const afterContentJson =
        getEditorHandle(snapshot.pageId)?.getContentJson() ?? null;

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "applied", {
          afterContentJson,
        }),
      );
    },
    [
      commitPageEdit,
      getEditorHandle,
      getPageEditReviewAvailable,
      setMessages,
      snapshotByToolCallId,
      visibleDiffToolCallId,
    ],
  );

  const handleTogglePageEditChanges = useCallback(
    (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot?.afterMarkdown) {
        return;
      }

      const handle = getEditorHandle(snapshot.pageId);

      if (!handle) {
        toast.error("Open the page in the editor to review this change.");
        return;
      }

      if (!getPageEditReviewAvailable(snapshot)) {
        toast.error("This update is no longer available", {
          description:
            "The page has changed since this suggestion was created.",
        });
        return;
      }

      if (
        visibleDiffToolCallId === toolCallId ||
        (handle.isEditDiffPreviewActive() &&
          handle.getActiveEditDiffToolCallId() === toolCallId)
      ) {
        handle.clearEditDiffPreview({ silent: true });
        setVisibleDiffToolCallId(null);
        return;
      }

      handle.clearEditDiffPreview({ silent: true });
      const shown = handle.showEditDiffPreview({
        afterMarkdown: snapshot.afterMarkdown,
        beforeMarkdown: snapshot.beforeMarkdown,
        toolCallId,
        useBeforeBaseline: snapshot.status === "applied",
      });

      if (!shown) {
        toast.error("Could not show changes in the editor.");
        return;
      }

      setVisibleDiffToolCallId(toolCallId);
      document
        .querySelector("[data-editor-surface]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [
      getEditorHandle,
      getPageEditReviewAvailable,
      snapshotByToolCallId,
      visibleDiffToolCallId,
    ],
  );

  const handleUndoPageEdit = useCallback(
    async (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot || snapshot.status !== "applied") {
        return;
      }

      const result = await undoPageEdit({
        beforeContentJson: snapshot.beforeContentJson,
        pageId: snapshot.pageId,
      });

      if (!result.success) {
        toast.error("Undo failed", {
          description: result.errorMessage,
        });
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "undone"),
      );
    },
    [
      getEditorHandle,
      setMessages,
      snapshotByToolCallId,
      undoPageEdit,
      visibleDiffToolCallId,
    ],
  );

  useEffect(() => {
    if (!error) {
      return;
    }

    logAiChatError("useChat error state", error, debugContextRef.current);

    const timeout = window.setTimeout(() => {
      clearError();
    }, 100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clearError, error]);

  const submitText = useCallback(
    async (content: string, files: PromptInputMessage["files"] = []) => {
      if (!content.trim() && files.length === 0) {
        return;
      }

      if (!isComposerReady) {
        toast.error("Ask AI failed", {
          description:
            "Sign in and select an active workspace before using AI.",
        });
        return;
      }

      const referencedOpenPageIds = [
        effectivePrimarySource?.type === "page" ? effectivePrimarySource.id : null,
        ...attachments
          .filter((attachment) => attachment.type === "page")
          .map((attachment) => attachment.id),
      ].filter((id): id is string => Boolean(id));
      const unsynchronizedPage = referencedOpenPageIds.find((id) => {
        const handle = getEditorHandle(id);
        return handle ? !handle.isSynchronized() : false;
      });
      if (unsynchronizedPage) {
        toast.error("Wait for the page to finish syncing", {
          description: "Ask AI reads the server-owned page snapshot, so unsynced edits cannot be attached yet.",
        });
        return;
      }

      let targetThreadId = threadId;

      if (!targetThreadId) {
        if (threadCreationPromiseRef.current) {
          return;
        }

        threadCreationPromiseRef.current = createThread
          .mutateAsync({})
          .then((response) => response.thread.id);

        try {
          targetThreadId = await threadCreationPromiseRef.current;
        } catch (creationError) {
          toast.error("Failed to create chat", {
            description:
              creationError instanceof Error
                ? creationError.message
                : "Try again.",
          });
          return;
        } finally {
          threadCreationPromiseRef.current = null;
        }
      }

      let uploadedFiles: Awaited<ReturnType<typeof uploadAiChatFile>>[] = [];
      try {
        uploadedFiles = await Promise.all(files.map((part) =>
          uploadAiChatFile({
            part,
            threadId: targetThreadId,
            workspaceId,
          })
        ));
      } catch (uploadError) {
        toast.error("File upload failed", {
          description: uploadError instanceof Error ? uploadError.message : "Try again.",
        });
        throw uploadError;
      }

      logPageContextSent({
        attachmentCount: attachments.length,
        charCount: pageContext.length,
      });

      setText("");
      setTextCursor(0);
      setDismissedMentionKey(null);

      try {
        await sendMessage(
          {
            files: uploadedFiles.map((file) => file.part),
            text: content.trim() || "Review the attached file(s).",
          },
          {
            body: buildChatRequestBody(
              targetThreadId,
              uploadedFiles.map((file) => file.id),
              crypto.randomUUID(),
            ),
          },
        );
      } finally {
        if (!threadId) {
          void queryClient.invalidateQueries({
            queryKey: aiChatThreadsQueryKey(workspaceId),
          });
          onThreadCreated?.(targetThreadId);
        }
      }
    },
    [
      attachments,
      buildChatRequestBody,
      createThread,
      effectivePrimarySource,
      getEditorHandle,
      isComposerReady,
      onThreadCreated,
      pageContext,
      queryClient,
      sendMessage,
      threadId,
      workspaceId,
    ],
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => submitText(message.text || "", message.files),
    [submitText],
  );

  const existingAttachmentKeys = useMemo(() => {
    const keys = new Set(attachments.map((item) => getAttachmentKey(item)));

    if (effectivePrimarySource) {
      keys.add(getAttachmentKey(effectivePrimarySource));
    }

    return keys;
  }, [attachments, effectivePrimarySource]);

  const syncTextCursor = useCallback(() => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    setTextCursor(cursor);
  }, [text.length]);

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      const caretPosition = event.target.selectionStart ?? nextValue.length;

      setText(nextValue);
      setTextCursor(caretPosition);
      setDismissedMentionKey(null);
    },
    [],
  );

  const clearMentionTrigger = useCallback(() => {
    if (!activeMentionTrigger) {
      return;
    }

    const before = text.slice(0, activeMentionTrigger.mentionStart);
    const after = text.slice(
      activeMentionTrigger.mentionStart +
        1 +
        activeMentionTrigger.mentionQuery.length,
    );
    const nextValue = `${before}${after}`.trimStart();

    setText(nextValue);
    setTextCursor(before.length);
    setDismissedMentionKey(null);
  }, [activeMentionTrigger, text]);

  const handleAttachContext = useCallback(
    (attachment: ContextAttachment) => {
      const key = getAttachmentKey(attachment);

      if (existingAttachmentKeys.has(key)) {
        clearMentionTrigger();
        return;
      }

      if (primarySource && getAttachmentKey(primarySource) === key) {
        setPrimaryDismissed(false);
        clearMentionTrigger();
        textareaRef.current?.focus();
        return;
      }

      setAttachments((current) => [...current, attachment]);
      clearMentionTrigger();
      textareaRef.current?.focus();
    },
    [clearMentionTrigger, existingAttachmentKeys, primarySource],
  );

  const handleRemovePrimary = useCallback(() => {
    setPrimaryDismissed(true);
  }, []);

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionMenuOpen) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMentionIndex((index) =>
          mentionMenuEntries.length
            ? (index + 1) % mentionMenuEntries.length
            : 0,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMentionIndex((index) =>
          mentionMenuEntries.length
            ? (index - 1 + mentionMenuEntries.length) %
              mentionMenuEntries.length
            : 0,
        );
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedMentionKey(mentionKey);
        return;
      }

      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
        event.preventDefault();

        const selectedEntry = mentionMenuEntries[selectedMentionIndex];

        if (selectedEntry) {
          mentionMenuRef.current?.activateEntry(selectedEntry);
        } else {
          setDismissedMentionKey(mentionKey);
        }
      }
    },
    [mentionKey, mentionMenuEntries, mentionMenuOpen, selectedMentionIndex],
  );

  const handleRemoveAttachment = useCallback(
    (attachment: ContextAttachment) => {
      setAttachments((current) =>
        current.filter(
          (item) => getAttachmentKey(item) !== getAttachmentKey(attachment),
        ),
      );
    },
    [],
  );

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setModel(modelId);
      setModelSelectorOpen(false);
    },
    [setModel, setModelSelectorOpen],
  );

  const handleSubmitFeedback = useCallback(
    async (messageId: string, rating: -1 | 1, reason?: string) => {
      if (!threadId) return;

      try {
        await submitFeedback.mutateAsync({
          messageId,
          rating,
          reason,
          threadId,
        });
        toast.success("Feedback saved.");
      } catch (feedbackError) {
        toast.error("Could not save feedback", {
          description:
            feedbackError instanceof Error
              ? feedbackError.message
              : "Try again.",
        });
      }
    },
    [submitFeedback, threadId],
  );

  const hasMessages = visibleMessages.length > 0;
  const showPendingAssistant = shouldShowPendingAssistant(messages, status);

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    previousMessageCountRef.current = visibleMessages.length;

    if (!(previousMessageCount === 0 && visibleMessages.length > 0)) {
      return;
    }

    const scrollShell = rootRef.current?.closest(
      "[data-ai-scroll-shell]",
    ) as HTMLElement | null;

    window.requestAnimationFrame(() => {
      scrollShell?.scrollTo({
        behavior: "smooth",
        top: scrollShell.scrollHeight,
      });
    });
  }, [visibleMessages.length]);

  return (
    <div
      className={
        hasMessages || isSidebar
          ? "relative flex h-full min-h-0 flex-col"
          : "relative flex h-full min-h-0 flex-col justify-center"
      }
      ref={rootRef}
    >
      <Conversation
        className={
          hasMessages || isSidebar ? "min-h-0" : "flex-none overflow-visible"
        }
      >
        <ConversationContent
          className={
            hasMessages || isSidebar
              ? "px-0 pb-10 md:px-4"
              : "px-0 pb-0 md:px-4"
          }
        >
          {!hasMessages ? (
            <EmptyState isSidebar={isSidebar} onSuggestion={setText} />
          ) : (
            visibleMessages.map((message) => (
              <ChatMessage
                applyingToolCallIds={applyingToolCallIds}
                feedbackPending={
                  submitFeedback.isPending &&
                  submitFeedback.variables?.messageId === message.id
                }
                feedbackRating={
                  feedbackByMessageId.get(message.id)?.rating
                }
                getPageEditBaselineCurrent={getPageEditBaselineCurrent}
                getPageEditReviewAvailable={getPageEditReviewAvailable}
                isSidebar={isSidebar}
                key={message.id}
                message={message}
                onApplyPageEdit={handleApplyPageEdit}
                onDiscardPageEdit={handleDiscardPageEdit}
                onSubmitFeedback={handleSubmitFeedback}
                onTogglePageEditChanges={handleTogglePageEditChanges}
                onUndoPageEdit={handleUndoPageEdit}
                snapshotByToolCallId={snapshotByToolCallId}
                threadId={threadId}
                visibleDiffToolCallId={visibleDiffToolCallId}
                workspaceId={workspaceId}
              />
            ))
          )}
          {showPendingAssistant ? <PendingAssistantStatus /> : null}
        </ConversationContent>
      </Conversation>
      <div
        className={
          hasMessages || isSidebar
            ? "sticky bottom-0 z-10 -mx-4 mt-auto grid shrink-0 gap-3 bg-gradient-to-t from-background via-backdrop to-transparent px-4 pb-4 pt-16 md:mx-0 md:px-4 md:pb-6 md:pt-20"
            : "z-10 -mx-4 grid shrink-0 gap-3 px-4 pb-4 md:mx-0 md:px-4"
        }
      >
        <ShellScrollButton targetRef={rootRef} />
        <div className="mx-auto w-full max-w-3xl">
          {isSidebar ? (
            <div className="mb-2 px-1 text-xs text-muted-foreground">
              {isContextLoading
                ? "Loading page context..."
                : contextError
                  ? "Page context failed"
                  : pageContext
                    ? "Page context ready"
                    : null}
            </div>
          ) : null}
          <PromptInput
            accept={AI_FILE_ACCEPT}
            globalDrop
            inputGroupClassName="h-auto items-stretch overflow-visible focus-within:border-input focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0"
            maxFileSize={MAX_AI_FILE_BYTES}
            maxFiles={MAX_AI_FILES}
            multiple
            onError={(attachmentError) => toast.error("Cannot attach file", {
              description: attachmentError.message,
            })}
            onSubmit={handleSubmit}
          >
            <PromptInputAttachments />
            <ContextAttachChips
              attachments={attachments}
              onRemove={handleRemoveAttachment}
              onRemovePrimary={handleRemovePrimary}
              primaryAttachment={primaryAttachment}
            />
            <div className="relative w-full min-w-0 flex-1 self-stretch">
              {mentionMenuOpen ? (
                <ContextAttachMenu
                  currentDatabaseId={databaseId}
                  currentPageId={pageId}
                  existingAttachmentKeys={existingAttachmentKeys}
                  onEntriesChange={setMentionMenuEntries}
                  onSelect={handleAttachContext}
                  open={mentionMenuOpen}
                  query={activeMentionTrigger?.mentionQuery ?? ""}
                  ref={mentionMenuRef}
                  selectedIndex={selectedMentionIndex}
                  setSelectedIndex={setSelectedMentionIndex}
                />
              ) : null}
              <PromptInputTextarea
                className="w-full px-2 focus-visible:border-transparent focus-visible:ring-0"
                onChange={handleTextChange}
                onClick={syncTextCursor}
                onKeyDown={handleTextareaKeyDown}
                onSelect={syncTextCursor}
                placeholder="Ask about your page, or type @ to attach pages and databases..."
                ref={textareaRef}
                value={text}
              />
            </div>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger tooltip="Attach files">
                    <PlusIcon className="size-4" />
                  </PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <ModelSelector
                  onOpenChange={setModelSelectorOpen}
                  open={modelSelectorOpen}
                >
                  <ModelSelectorTrigger asChild>
                    <PromptInputButton>
                      {selectedModelData?.chefSlug && (
                        <ModelSelectorLogo
                          provider={getProviderLogoSlug(
                            selectedModelData.chefSlug,
                          )}
                        />
                      )}
                      {selectedModelData?.name && (
                        <ModelSelectorName>
                          {selectedModelData.name}
                        </ModelSelectorName>
                      )}
                    </PromptInputButton>
                  </ModelSelectorTrigger>
                  <ModelSelectorContent>
                    <ModelSelectorInput placeholder="Search models..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      {chefs.map((chef) => (
                        <ModelSelectorGroup heading={chef} key={chef}>
                          {models
                            .filter((m) => m.chef === chef)
                            .map((m) => (
                              <ModelItem
                                isSelected={model === m.id}
                                key={m.id}
                                m={m}
                                onSelect={handleModelSelect}
                              />
                            ))}
                        </ModelSelectorGroup>
                      ))}
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              </PromptInputTools>
              <PromptInputSubmit
                status={
                  createThread.isPending
                    ? "submitted"
                    : (status as ChatStatus)
                }
                onStop={stop}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
