"use client";

import {
  buildPrimaryAttachment,
  getAttachmentKey,
  parseMentionState,
  type ContextAttachMenuEntry,
  type ContextAttachMenuHandle,
} from "./context-attach-menu";
import { usePageEditorRegistry } from "@/features/editor/runtime/page-editor-registry";
import { usePageAiContext } from "../../context/use-page-ai-context";
import { useDatabaseEmbedAutoApply } from "../../cache/use-database-embed-auto-apply";
import { useDatabaseToolCacheSync } from "../../cache/use-database-tool-cache-sync";
import { useAgentLiveEffects } from "../../cache/use-agent-live-effects";
import {
  updatePageEditSnapshotStatus,
  usePageEditAutoApply,
} from "../../cache/use-page-edit-auto-apply";
import { usePageEditApplier } from "../../cache/use-page-edit-applier";
import {
  AgentLiveDebugger,
  useAgentLiveDebugger,
} from "./agent-live-debugger";
import type { PromptInputMessage } from "./prompt-input";
import {
  isHostedDemoRuntime,
  requestDemoGuard,
} from "@/features/demo";
import {
  aiChatThreadMessagesQueryKey,
  aiChatThreadMessagesQueryOptions,
  aiChatThreadsQueryKey,
  buildPageEditSnapshotMap,
  dedupeChatMessagesById,
  isPageEditBaselineCurrent,
  isPageEditReviewAvailable,
  logPageEdit,
  isAgentProgressPart,
  type AiChatFeedback,
  type AiChatThreadMessagesResponse,
  type PageEditSnapshotPart,
  useCreateAiChatThread,
  useSubmitAiChatFeedback,
  useWorkspaceAiModels,
} from "@zilobase/features/ai-chat";
import { useAgentConversation } from "@zilobase/ai-conversation-adapter";
import {
  useAiDevMessageTrace,
  useAiDevTrace,
} from "../../debug/use-ai-dev-trace";
import { useSession } from "@zilobase/features/auth";
import { useZilobaseFeatures } from "@zilobase/features";
import { useDatabase } from "@zilobase/features/databases";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces";
import { usePageAccessLevel, usePageNavigation } from "@zilobase/features/pages";
import { useQuery } from "@tanstack/react-query";
import {
  getApiRequestHeaders,
  resolveApiBaseUrl,
} from "@/features/desktop/network/api";
import {
  type UIMessage,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import posthog from "@/shared/lib/posthog";
import { ChatbotComposer } from "./chatbot-composer";
import { ChatbotMessages } from "./chatbot-messages";
import { AI_SCROLL_SHELL_SELECTOR } from "./chatbot-scroll-control";
import { uploadAiChatFile } from "../../lib/ai-file-upload";
import {
  areMessagesEquivalent,
  emptyAgentChatMessages,
  fallbackModels,
  logAiChatError,
  summarizeMessagesForDebug,
} from "../../model/chat-runtime-model";

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
      <ChatbotConversationController
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
      <div className="flex min-h-40 items-center justify-center text-content-secondary text-sm">
        Loading chat...
      </div>
    );
  }

  return (
    <ChatbotConversationController
      {...props}
      initialMessages={seededInitialMessages.messages}
      initialFeedback={queriedInitialFeedback}
      key={initialMessagesKey}
    />
  );
};

const ChatbotConversationController = ({
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
  const [feedbackReadyMessageIds, setFeedbackReadyMessageIds] = useState(
    () => new Set(
      initialMessages
        .filter((message) => message.role === "assistant")
        .map((message) => message.id),
    ),
  );
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
  const conversationId = threadId ?? "chat-not-ready";

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
      debugStream: import.meta.env.DEV,
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
  const handleAgentData = useAgentLiveEffects();
  const liveDebugger = useAgentLiveDebugger();
  const devTrace = useAiDevTrace({ threadId, workspaceId });
  const debugContextRef = useRef<Record<string, unknown>>({});
  const handleAgentStreamData = useCallback((part: {
    data: unknown;
    type: string;
  }) => {
    handleAgentData(part);
    liveDebugger.onData(part);
    devTrace.record("stream-data", part);
  }, [devTrace.record, handleAgentData, liveDebugger.onData]);

  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useAgentConversation({
    apiBaseUrl: resolveApiBaseUrl(),
    headers: getApiRequestHeaders(),
    id: conversationId,
    initialMessages,
    onData: handleAgentStreamData,
    onError: (chatError) => {
      devTrace.record("response-error", chatError);
      logAiChatError("useChat onError", chatError, {
        conversationId,
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
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      devTrace.record("response-finish", {
        isAbort,
        isDisconnect,
        isError,
        message,
      });
      if (isAbort || isDisconnect || isError) return;
      setFeedbackReadyMessageIds((current) => {
        const next = new Set(current);
        next.add(message.id);
        return next;
      });
      const hasVisibleOutput = message.parts.some(
        (part) =>
          (part.type === "text" && part.text.trim().length > 0) ||
          isToolUIPart(part) ||
          isAgentProgressPart(part),
      );
      if (hasVisibleOutput) return;
      logAiChatError(
        "Ask AI stream finished without visible output",
        new Error("The provider completed an empty assistant response."),
        debugContextRef.current,
      );
      toast.error("Ask AI returned no response", {
        description: "Nothing was generated. Please retry your message.",
      });
    },
    threadId,
    userId,
    workspaceId,
  });

  useAiDevMessageTrace(messages, devTrace.record);

  useEffect(() => {
    debugContextRef.current = {
      conversationId,
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
    conversationId,
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

      if (isHostedDemoRuntime()) {
        requestDemoGuard();
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
      devTrace.record("submission-received", {
        files: files.map((file) => ({
          filename: file.filename,
          mediaType: file.mediaType,
        })),
        text: content.trim(),
      }, targetThreadId);
      try {
        uploadedFiles = await Promise.all(files.map((part) =>
          uploadAiChatFile({
            part,
            threadId: targetThreadId,
            workspaceId,
          })
        ));
      } catch (uploadError) {
        devTrace.record("file-upload-error", uploadError, targetThreadId);
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
      liveDebugger.reset();

      try {
        const clientTurnId = crypto.randomUUID();
        const requestBody = buildChatRequestBody(
          targetThreadId,
          uploadedFiles.map((file) => file.id),
          clientTurnId,
        );
        devTrace.record("user-message", {
          clientTurnId,
          contextRefs: requestBody.contextRefs,
          files: uploadedFiles.map((file) => ({
            id: file.id,
            filename: file.part.filename,
            mediaType: file.part.mediaType,
          })),
          modelId: requestBody.modelId,
          text: content.trim() || "Review the attached file(s).",
        }, targetThreadId);
        devTrace.record("turn-start", { clientTurnId }, targetThreadId);
        posthog?.capture("ai_chat_message_submitted", {
          has_attachments: uploadedFiles.length > 0,
          has_page_context: requestBody.contextRefs.length > 0,
        });
        await sendMessage(
          {
            files: uploadedFiles.map((file) => file.part),
            text: content.trim() || "Review the attached file(s).",
          },
          {
            body: requestBody,
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
      devTrace.record,
      effectivePrimarySource,
      getEditorHandle,
      isComposerReady,
      liveDebugger.reset,
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

  const handleRetryIncompleteDatabase = useCallback(
    (prompt: string) => submitText(prompt),
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
  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    previousMessageCountRef.current = visibleMessages.length;

    if (!(previousMessageCount === 0 && visibleMessages.length > 0)) {
      return;
    }

    const scrollShell = rootRef.current?.closest(
      AI_SCROLL_SHELL_SELECTOR,
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
        isSidebar
          ? "relative flex h-full min-h-0 flex-col"
          : hasMessages
            ? "relative flex min-h-full flex-col"
            : "relative flex min-h-full flex-col justify-center"
      }
      ref={rootRef}
    >
      <ChatbotMessages
        applyingToolCallIds={applyingToolCallIds}
        debuggerContent={import.meta.env.DEV ? (
          <AgentLiveDebugger
            events={liveDebugger.events}
            status={status}
            turnStartedAt={liveDebugger.turnStartedAt}
          />
        ) : null}
        feedbackByMessageId={feedbackByMessageId}
        feedbackPendingMessageId={
          submitFeedback.isPending
            ? submitFeedback.variables?.messageId
            : undefined
        }
        feedbackReadyMessageIds={feedbackReadyMessageIds}
        getPageEditBaselineCurrent={getPageEditBaselineCurrent}
        getPageEditReviewAvailable={getPageEditReviewAvailable}
        isSidebar={isSidebar}
        messages={messages}
        onApplyPageEdit={handleApplyPageEdit}
        onDiscardPageEdit={handleDiscardPageEdit}
        onRetryIncompleteDatabase={handleRetryIncompleteDatabase}
        onSubmitFeedback={handleSubmitFeedback}
        onSuggestion={setText}
        onTogglePageEditChanges={handleTogglePageEditChanges}
        onUndoPageEdit={handleUndoPageEdit}
        snapshotByToolCallId={snapshotByToolCallId}
        status={status}
        threadId={threadId}
        visibleDiffToolCallId={visibleDiffToolCallId}
        visibleMessages={visibleMessages}
        workspaceId={workspaceId}
      />
      <ChatbotComposer
        activeMentionQuery={activeMentionTrigger?.mentionQuery ?? ""}
        attachments={attachments}
        chefs={chefs}
        contextError={contextError}
        createThreadPending={createThread.isPending}
        currentDatabaseId={databaseId}
        currentPageId={pageId}
        existingAttachmentKeys={existingAttachmentKeys}
        hasMessages={hasMessages}
        isContextLoading={isContextLoading}
        isSidebar={isSidebar}
        mentionMenuOpen={mentionMenuOpen}
        mentionMenuRef={mentionMenuRef}
        model={model}
        modelSelectorOpen={modelSelectorOpen}
        models={models}
        onAttachContext={handleAttachContext}
        onEntriesChange={setMentionMenuEntries}
        onModelSelect={handleModelSelect}
        onModelSelectorOpenChange={setModelSelectorOpen}
        onRemoveAttachment={handleRemoveAttachment}
        onRemovePrimary={handleRemovePrimary}
        onStop={stop}
        onSubmit={handleSubmit}
        onTextChange={handleTextChange}
        onTextareaKeyDown={handleTextareaKeyDown}
        pageContextReady={Boolean(pageContext)}
        primaryAttachment={primaryAttachment}
        rootRef={rootRef}
        selectedMentionIndex={selectedMentionIndex}
        selectedModel={selectedModelData}
        setSelectedMentionIndex={setSelectedMentionIndex}
        status={status}
        syncTextCursor={syncTextCursor}
        text={text}
        textareaRef={textareaRef}
      />
    </div>
  );
};

export default Chatbot;
