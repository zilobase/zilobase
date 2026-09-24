import { ConnectorSetupCard } from "../../../settings/components/settings-connectors";
("use client");

import { toApiUrl } from "@/platform/network/api";
import { useZilobaseFeatures } from "@zilobase/features";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  FileTextIcon,
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
import { queryOptions, useQuery } from "@tanstack/react-query";
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
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "./message";
import { PageEditCard } from "./page-edit-card";
import { Shimmer } from "./shimmer";
import type { ToolPart } from "./tool";
import { pendingPhrases } from "../../model/chat-runtime-model";
import { shouldShowPendingAssistant } from "../../model/chat-message-visibility";

const PendingAssistantStatus = ({ status }: { status: ChatStatus }) => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrase =
    status === "submitted"
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
          <Shimmer as="span" className="truncate font-medium text-sm" duration={1.25} spread={1.1}>
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

function McpToolResultCard({
  output,
  toolCallId,
  workspaceId,
}: {
  output: unknown;
  toolCallId: string;
  workspaceId: string | null;
}) {
  const { dataset, jobId } = readMcpToolOutput(output);
  if (!dataset && !jobId) return null;
  return (
    <div
      className="not-prose mb-3 grid gap-3 rounded-lg border bg-surface-canvas p-3"
      key={toolCallId}
    >
      {dataset && <McpDatasetPreview dataset={dataset} />}
      {jobId && <McpImportProgress jobId={jobId} workspaceId={workspaceId} />}
    </div>
  );
}

function readMcpToolOutput(output: unknown) {
  const envelope = asRecord(output);
  const dataset = asRecord(asRecord(envelope?.data)?.dataset);
  const job = asRecord(envelope?.job);
  const jobId = typeof job?.id === "string" ? job.id : null;
  return { dataset, jobId };
}

function readDatasetPreview(dataset: Record<string, unknown>) {
  const sample = Array.isArray(dataset?.sample)
    ? dataset.sample
        .filter((row): row is Record<string, unknown> => Boolean(asRecord(row)))
        .slice(0, 20)
    : [];
  const columns = Array.isArray(asRecord(dataset?.schema)?.columns)
    ? (asRecord(dataset?.schema)!.columns as unknown[])
        .filter((column): column is string => typeof column === "string")
        .slice(0, 30)
    : [];
  return { sample, columns };
}

function McpDatasetPreview({ dataset }: { dataset: Record<string, unknown> }) {
  const { sample, columns } = readDatasetPreview(dataset);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Connector dataset preview</span>
        <span className="text-content-secondary">{String(dataset.rowCount ?? 0)} rows</span>
        {dataset.truncated === true && <span className="text-action-danger-text">Truncated</span>}
      </div>
      {sample.length > 0 && columns.length > 0 && (
        <div className="max-h-72 overflow-auto rounded border">
          <table className="w-full min-w-max text-left text-xs">
            <thead className="sticky top-0 bg-surface-secondary">
              <tr>
                {columns.map((column) => (
                  <th className="px-2 py-1.5 font-medium" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((row, rowIndex) => (
                <tr className="border-t" key={rowIndex}>
                  {columns.map((column) => (
                    <td className="max-w-56 truncate px-2 py-1.5" key={column}>
                      {displayPreviewCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-content-secondary">
        Preview up to 20 rows before asking Ask AI to create a one-time native database.
      </p>
    </div>
  );
}

function useMcpImportJob(jobId: string, workspaceId: string | null) {
  const { apiFetch } = useZilobaseFeatures();
  const jobQuery = useQuery(mcpImportJobQueryOptions(apiFetch, jobId, workspaceId));
  return jobQuery;
}

function mcpImportJobQueryOptions(
  apiFetch: ReturnType<typeof useZilobaseFeatures>["apiFetch"],
  jobId: string,
  workspaceId: string | null,
) {
  return queryOptions({
    enabled: Boolean(jobId && workspaceId),
    queryFn: ({ signal }) =>
      apiFetch<{
        job: {
          error: string | null;
          id: string;
          output: unknown;
          progress: number;
          status: string;
        };
      }>(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
        headers: workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {},
        signal,
      }).then((result) => result.job),
    queryKey: ["workspaces", workspaceId ?? "none", "ai-job", jobId] as const,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ["succeeded", "failed", "cancelled"].includes(status) ? false : 1_500;
    },
  });
}

function McpImportProgress({ jobId, workspaceId }: { jobId: string; workspaceId: string | null }) {
  const jobQuery = useMcpImportJob(jobId, workspaceId);
  const data = jobQuery.data ?? { status: "queued", progress: 0, error: null, output: null };
  const jobOutput = asRecord(data.output) ?? {};
  return (
    <div className="grid gap-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Database import</span>
        <span>
          {data.status} · {data.progress}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-surface-secondary">
        <div
          className="h-full bg-action-primary transition-[width]"
          style={{ width: `${data.progress}%` }}
        />
      </div>
      {data.error && <p className="text-action-danger-text">{data.error}</p>}
      {typeof jobOutput.databaseId === "string" && (
        <Button asChild className="w-fit" size="sm">
          <a href={`/d/${encodeURIComponent(jobOutput.databaseId)}`}>Open imported database</a>
        </Button>
      )}
      {jobOutput.status === "partial" && (
        <p className="text-action-danger-text">
          Partial import: {String(jobOutput.completedRows ?? 0)} completed,{" "}
          {String(jobOutput.failedRows ?? 0)} failed.
        </p>
      )}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function displayPreviewCell(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

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
      return [
        {
          id: ids.pageId,
          source: "page" as const,
          title:
            typeof input?.name === "string" && input.name.trim()
              ? input.name.trim()
              : "Created page",
          url: `/p/${encodeURIComponent(ids.pageId)}`,
        },
      ];
    }

    if (toolName === "createDatabase" && ids?.databaseId) {
      return [
        {
          id: ids.databaseId,
          source: "database" as const,
          title:
            typeof input?.name === "string" && input.name.trim()
              ? input.name.trim()
              : "Created database",
          url: `/d/${encodeURIComponent(ids.databaseId)}`,
        },
      ];
    }

    if (toolName === "createDatabaseRow" && ids?.rowPageId) {
      return [
        {
          id: ids.rowPageId,
          source: "page" as const,
          title:
            typeof input?.title === "string" && input.title.trim()
              ? input.title.trim()
              : "Created database page",
          url: `/p/${encodeURIComponent(ids.rowPageId)}`,
        },
      ];
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
            className="text-xs"
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
  onSubmitFeedback: (messageId: string, rating: -1 | 1, reason?: string) => void | Promise<void>;
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
      isAgentProgressPart(part) ? [[part.data.toolCallId, part.data] as const] : [],
    ),
  );
  const citations = collectMessageCitations(message);
  const tables = message.parts.flatMap((part) => {
    if (!isToolUIPart(part)) return [];
    const table = readAgentResultTable(part.output);
    return table ? [{ table, toolCallId: part.toolCallId }] : [];
  });
  const mcpResults = message.parts.flatMap((part) =>
    isToolUIPart(part) &&
    part.state === "output-available" &&
    (getToolName(part).startsWith("mcp_") ||
      getToolName(part) === "materializeConnectedDataAsDatabase")
      ? [{ output: part.output, toolCallId: part.toolCallId }]
      : [],
  );

  function renderPageEditPart(part: UIMessage["parts"][number], index: number) {
    if (isToolUIPart(part)) {
      const toolName = getToolName(part);

      if (isProposePageContentUpdateToolName(toolName)) {
        const snapshot = snapshotByToolCallId.get(part.toolCallId) ?? null;

        return (
          <PageEditToolPart
            isApplying={
              applyingToolCallIds.includes(part.toolCallId) &&
              !snapshotByToolCallId.has(part.toolCallId)
            }
            isBaselineCurrent={snapshot ? getPageEditBaselineCurrent(snapshot) : false}
            isDiffVisible={visibleDiffToolCallId === part.toolCallId}
            isReviewAvailable={snapshot ? getPageEditReviewAvailable(snapshot) : false}
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
  }
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.flatMap((part, index) => {
          const p = part as unknown as {
            type: string;
            data?: { provider?: string; scope?: string };
            output?: { type?: string; provider?: string; scope?: string };
          };
          const data =
            p.type === "data-connector-setup"
              ? p.data
              : p.output?.type === "connector-setup"
                ? p.output
                : null;
          return data?.provider
            ? [
                <ConnectorSetupCard
                  key={`connect-${index}`}
                  provider={data.provider}
                  scope={data.scope}
                />,
              ]
            : [];
        })}
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
            return <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>;
          }

          if (part.type === "reasoning") {
            return null;
          }

          if (isAgentProgressPart(part)) {
            const hasMatchingToolPart = message.parts.some(
              (candidate) =>
                isToolUIPart(candidate) && candidate.toolCallId === part.data.toolCallId,
            );
            return hasMatchingToolPart ? null : (
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

          return renderPageEditPart(part, index);
        })}
        {tables.map(({ table, toolCallId }) => (
          <AgentResultTable key={toolCallId} table={table} />
        ))}
        {mcpResults.map(({ output, toolCallId }) => (
          <McpToolResultCard
            key={toolCallId}
            output={output}
            toolCallId={toolCallId}
            workspaceId={workspaceId}
          />
        ))}
        {threadId && workspaceId ? (
          <AgentActionReviews message={message} threadId={threadId} workspaceId={workspaceId} />
        ) : null}
        <AgentResourceBadges citations={citations} openInMainPage={isSidebar} />
        {message.role === "assistant" && showFeedback ? (
          <AssistantFeedback
            isPending={feedbackPending}
            onSubmit={(rating, reason) => onSubmitFeedback(message.id, rating, reason)}
            rating={feedbackRating}
          />
        ) : null}
      </MessageContent>
    </Message>
  );
};

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
        className={hasMessages || isSidebar ? "px-0 pb-10 md:px-0" : "px-0 pb-0 md:px-0"}
        scrollClassName={
          isSidebar ? undefined : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"
        }
      >
        {hasMessages
          ? visibleMessages.map((message) => (
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
          : null}
        {debuggerContent}
        {shouldShowPendingAssistant(messages, status) ? (
          <PendingAssistantStatus status={status} />
        ) : null}
      </ConversationContent>
    </Conversation>
  );
};
