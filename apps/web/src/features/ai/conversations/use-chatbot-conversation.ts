import { useConversationDraft } from "./use-conversation-draft";
import { conversationReadiness } from "./model/conversation-draft";
import { useConversationStream } from "./use-conversation-stream";

import { useConversationModel } from "./use-conversation-model";
import { usePageEditReview } from "./effects/use-page-edit-review";
import { flushSettingsDrafts } from "../settings/use-settings-draft";

import { usePageEditorRegistry } from "@/features/editor/runtime/page-editor-registry";

import { useDatabaseEmbedAutoApply } from "./effects/use-database-embed-auto-apply";
import { useDatabaseToolCacheSync } from "./effects/use-database-tool-cache-sync";

import { usePageEditAutoApply } from "./effects/use-page-edit-auto-apply";

import type { PromptInputMessage } from "./components/elements/prompt-input";
import { isHostedDemoRuntime, requestDemoGuard } from "@/features/demo";
import {
  aiChatThreadMessagesQueryKey,
  aiChatThreadsQueryKey,
  dedupeChatMessagesById,
  logPageEdit,
  type AiChatThreadMessagesResponse,
} from "@zilobase/features/ai-chat";
import { useCreateAiChatThread, useSubmitAiChatFeedback } from "@zilobase/features/ai-chat/react";

import { useSession } from "@zilobase/features/auth/react";
import { useZilobaseFeatures } from "@zilobase/features";

import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";

import {
  extractPageMarkdownFromContext,
  logPageContextSent,
  logPageContextRebuild,
} from "@zilobase/page-context";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import posthog from "@/shared/lib/posthog";

import { AI_SCROLL_SHELL_SELECTOR } from "./components/elements/chatbot-scroll-control";
import { uploadAiChatFile } from "../files/ai-file-upload";
import { areMessagesEquivalent } from "./model/chat-runtime-model";
import type { ChatbotConversationInput } from "./conversation-interface";
import { buildConversationRequest } from "./model/conversation-draft";

export function useChatbotConversation({
  databaseId = null,
  initialFeedback,
  initialMessages,
  isSidebar = false,
  onDraftDirtyChange,
  onInitialSubmissionConsumed,
  onInitialSubmissionPrepared,
  onThreadCreated,
  pendingInitialSubmission,
  threadId,
  pageId = null,
}: ChatbotConversationInput) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const threadCreationPromiseRef = useRef<Promise<string> | null>(null);
  const consumedInitialSubmissionRef = useRef<string | null>(null);
  const workspaceId = useActiveWorkspaceId();
  const draft = useConversationDraft({
    workspaceId,
    isSidebar,
    pageId,
    databaseId,
  });
  const { text, attachments, setText, resetDraft, clearSubmittedDraft } = draft;
  const {
    effectivePrimarySource,
    isContextLoading,
    pageContext,
    pageAccessLevel,
    allowedPageIds,
    canApplyPageEdits,
  } = draft.context;
  const {
    model,
    modelSelectorOpen,
    setModelSelectorOpen,
    models,
    selectedModelData,
    chefs,
    handleModelSelect,
  } = useConversationModel();

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
  const { isAgentReady, isComposerReady, conversationId } = conversationReadiness(
    workspaceId,
    userId,
    threadId,
  );

  const { getEditorHandle } = usePageEditorRegistry();
  const buildChatRequestBody = useCallback(
    (
      requestThreadId: string | null,
      attachmentIds: string[] = [],
      clientTurnId = crypto.randomUUID(),
    ) =>
      buildConversationRequest({
        attachments,
        primarySource: effectivePrimarySource,
        modelId: model,
        debugStream: import.meta.env.DEV,
        threadId: requestThreadId,
        attachmentIds,
        clientTurnId,
      }),
    [attachments, effectivePrimarySource, model],
  );

  const threadMessagesQueryKey = useMemo(
    () => (workspaceId && threadId ? aiChatThreadMessagesQueryKey(workspaceId, threadId) : null),
    [workspaceId, threadId],
  );
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    feedbackReadyMessageIds,
    liveDebugger,
    devTrace,
  } = useConversationStream({
    initialMessages,
    conversationId,
    canApplyPageEdits,
    isAgentReady,
    isSidebar,
    workspaceId,
    threadId,
    userId,
    pageContextChars: pageContext.length,
    pageId,
    databaseId,
  });

  useEffect(() => {
    if (
      !pendingInitialSubmission ||
      pendingInitialSubmission.threadId !== threadId ||
      !isAgentReady ||
      consumedInitialSubmissionRef.current === pendingInitialSubmission.threadId
    ) {
      return;
    }

    consumedInitialSubmissionRef.current = pendingInitialSubmission.threadId;
    onInitialSubmissionConsumed?.();
    void sendMessage(pendingInitialSubmission.message, {
      body: pendingInitialSubmission.body,
    });
  }, [isAgentReady, onInitialSubmissionConsumed, pendingInitialSubmission, sendMessage, threadId]);

  const {
    snapshotByToolCallId,
    visibleDiffToolCallId,
    resetPageEditReview,
    getPageEditBaselineCurrent,
    getPageEditReviewAvailable,
    handleDiscardPageEdit,
    handleApplyPageEdit,
    handleTogglePageEditChanges,
    handleUndoPageEdit,
  } = usePageEditReview({ messages, setMessages });

  useEffect(() => {
    resetDraft();
    resetPageEditReview();
    previousMessageCountRef.current = 0;
  }, [threadId, resetPageEditReview, resetDraft]);

  useEffect(() => {
    if (!isSidebar) {
      return;
    }

    logPageEdit("chat:page-edit-config", {
      allowedPageIds,
      canApplyPageEdits,
      primaryPageId: effectivePrimarySource?.type === "page" ? effectivePrimarySource.id : null,
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
      pageContext ? extractPageMarkdownFromContext(pageContext, targetPageId) : null,
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

  const visibleMessages = useMemo(
    () =>
      dedupeChatMessagesById(
        messages.filter((message) => message.role === "user" || message.role === "assistant"),
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

    queryClient.setQueryData<AiChatThreadMessagesResponse>(threadMessagesQueryKey, (current) => {
      if (!current) {
        return current;
      }

      if (areMessagesEquivalent(current.messages, messages)) {
        return current;
      }

      return { ...current, messages };
    });
  }, [messages, queryClient, status, threadMessagesQueryKey]);

  const submitText = useCallback(
    async (content: string, files: PromptInputMessage["files"] = []) => {
      if (!content.trim() && files.length === 0) {
        return;
      }

      if (isHostedDemoRuntime()) {
        requestDemoGuard();
        return;
      }

      if (!isComposerReady || !workspaceId) {
        toast.error("Ask AI failed", {
          description: "Sign in and select an active workspace before using AI.",
        });
        return;
      }

      try {
        await flushSettingsDrafts();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not preserve settings draft.");
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
          description:
            "Ask AI reads the server-owned page snapshot, so unsynced edits cannot be attached yet.",
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
            description: creationError instanceof Error ? creationError.message : "Try again.",
          });
          return;
        } finally {
          threadCreationPromiseRef.current = null;
        }
      }

      let uploadedFiles: Awaited<ReturnType<typeof uploadAiChatFile>>[] = [];
      devTrace.record(
        "submission-received",
        {
          files: files.map((file) => ({
            filename: file.filename,
            mediaType: file.mediaType,
          })),
          text: content.trim(),
        },
        targetThreadId,
      );
      try {
        uploadedFiles = await Promise.all(
          files.map((part) =>
            uploadAiChatFile({
              part,
              threadId: targetThreadId,
              workspaceId,
            }),
          ),
        );
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

      clearSubmittedDraft();
      liveDebugger.reset();

      try {
        const clientTurnId = crypto.randomUUID();
        const requestBody = buildChatRequestBody(
          targetThreadId,
          uploadedFiles.map((file) => file.id),
          clientTurnId,
        );
        devTrace.record(
          "user-message",
          {
            clientTurnId,
            contextRefs: requestBody.contextRefs,
            files: uploadedFiles.map((file) => ({
              id: file.id,
              filename: file.part.filename,
              mediaType: file.part.mediaType,
            })),
            modelId: requestBody.modelId,
            text: content.trim() || "Review the attached file(s).",
          },
          targetThreadId,
        );
        devTrace.record("turn-start", { clientTurnId }, targetThreadId);
        posthog?.capture("ai_chat_message_submitted", {
          has_attachments: uploadedFiles.length > 0,
          has_page_context: requestBody.contextRefs.length > 0,
        });

        if (!threadId && onInitialSubmissionPrepared) {
          void queryClient.invalidateQueries({
            queryKey: aiChatThreadsQueryKey(workspaceId),
          });
          onInitialSubmissionPrepared({
            body: requestBody,
            message: {
              files: uploadedFiles.map((file) => file.part),
              text: content.trim() || "Review the attached file(s).",
            },
            threadId: targetThreadId,
          });
          return;
        }

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
      clearSubmittedDraft,
      devTrace.record,
      effectivePrimarySource,
      getEditorHandle,
      isComposerReady,
      liveDebugger.reset,
      onInitialSubmissionPrepared,
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
          description: feedbackError instanceof Error ? feedbackError.message : "Try again.",
        });
      }
    },
    [submitFeedback, threadId],
  );

  const hasMessages = visibleMessages.length > 0;
  useEffect(() => {
    if (threadId) return;
    onDraftDirtyChange?.(Boolean(text.trim() || attachments.length));
  }, [attachments.length, onDraftDirtyChange, text, threadId]);
  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    previousMessageCountRef.current = visibleMessages.length;

    if (!(previousMessageCount === 0 && visibleMessages.length > 0)) {
      return;
    }

    const scrollShell = rootRef.current?.closest(AI_SCROLL_SHELL_SELECTOR) as HTMLElement | null;

    window.requestAnimationFrame(() => {
      scrollShell?.scrollTo({
        behavior: "smooth",
        top: scrollShell.scrollHeight,
      });
    });
  }, [visibleMessages.length]);

  return {
    rootRef,
    hasMessages,
    session,
    setText,
    liveDebugger,
    status,
    messagesProps: {
      applyingToolCallIds: applyingToolCallIds,
      feedbackByMessageId: feedbackByMessageId,
      feedbackPendingMessageId: submitFeedback.isPending
        ? submitFeedback.variables?.messageId
        : undefined,
      feedbackReadyMessageIds: feedbackReadyMessageIds,
      getPageEditBaselineCurrent: getPageEditBaselineCurrent,
      getPageEditReviewAvailable: getPageEditReviewAvailable,
      isSidebar: isSidebar,
      messages: messages,
      onApplyPageEdit: handleApplyPageEdit,
      onDiscardPageEdit: handleDiscardPageEdit,
      onRetryIncompleteDatabase: handleRetryIncompleteDatabase,
      onSubmitFeedback: handleSubmitFeedback,
      onTogglePageEditChanges: handleTogglePageEditChanges,
      onUndoPageEdit: handleUndoPageEdit,
      snapshotByToolCallId: snapshotByToolCallId,
      status: status,
      threadId: threadId,
      visibleDiffToolCallId: visibleDiffToolCallId,
      visibleMessages: visibleMessages,
      workspaceId: workspaceId,
    },
    composerProps: {
      ...draft.composerProps,

      chefs: chefs,

      createThreadPending: createThread.isPending,

      isSidebar: isSidebar,

      model: model,
      modelSelectorOpen: modelSelectorOpen,
      models: models,

      onModelSelect: handleModelSelect,
      onModelSelectorOpenChange: setModelSelectorOpen,

      onStop: stop,
      onSubmit: handleSubmit,

      pageContextReady: Boolean(pageContext),

      rootRef: rootRef,

      selectedModel: selectedModelData,

      status: status,
    },
  };
}
