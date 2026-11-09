import { ChatEmptyState } from "./chat-empty-state";
import { ChatError, ChatLoading } from "./chat-feedback";
import {
  refreshAfterWorkspaceActions,
  terminalChatRun,
  type ChatRunReceipt,
} from "@zilobase/features/ai";
import { useQueryClient } from "@tanstack/react-query";
import {
  chatReferenceMarker,
  resolveChatReferences,
  type ChatRequestInput,
} from "@zilobase/features/ai";
import {
  useSendChat,
  useFollowChatRun,
  useCancelChatRun,
  useRecoverChatSubmission,
  useChatThreads,
  useChatSelection,
} from "@zilobase/features/ai/react";
import { useChatAttachments } from "../../attachments/hooks/use-chat-attachments";
import { ChatLayout } from "./chat-layout";
import {
  MessageScroller,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Button } from "@/components/ui/button";
import { ChatbotComposer } from "../../composer/components/chatbot-composer";
import { ChatbotMessages, type ChatMessage } from "./chatbot-messages";
import { useSession } from "@zilobase/features/auth/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PromptInputMessage } from "@/components/ui/prompt-input";

export default function Chatbot({
  isSidebar = false,
  beforeComposer,
  workspaceId,
  pageId,
  databaseId,
}: {
  isSidebar?: boolean;
  beforeComposer?: ReactNode;
  workspaceId: string | null;
  pageId?: string | null;
  databaseId?: string | null;
}) {
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const queryClient = useQueryClient();
  const appliedActions = useRef(new Set<string>());
  useEffect(() => {
    if (!workspaceId) return;
    for (const message of messages)
      if (message.role === "assistant")
        void refreshAfterWorkspaceActions(
          queryClient,
          workspaceId,
          message.progress,
          appliedActions.current,
        );
  }, [messages, queryClient, workspaceId]);
  const [pendingTurn, setPendingTurn] = useState<{ messages: ChatMessage[]; label: string } | null>(
    null,
  );
  const attachmentState = useChatAttachments();
  const send = useSendChat();
  const follow = useFollowChatRun();
  const cancelRun = useCancelChatRun();
  const recoverSubmission = useRecoverChatSubmission();
  const activeRun = useRef<ChatRunReceipt | null>(null);
  const [streaming, setStreaming] = useState(false);
  const selection = useChatSelection(workspaceId ?? "");
  const threads = useChatThreads(workspaceId ?? "", selection.id, !streaming);
  const loadedThread = useRef<string | null>(null);
  const activeSelection = useRef(selection.revision);
  useEffect(() => {
    if (selection.initialized || !threads.list.isSuccess || !workspaceId) return;
    let disposed = false;
    const revision = selection.revision;
    void recoverSubmission(workspaceId)
      .then((receipt) => {
        if (!disposed && selection.isCurrent(revision))
          selection.select(receipt?.threadId ?? threads.list.data?.[0]?.id ?? null);
      })
      .catch(() => {
        if (!disposed && selection.isCurrent(revision))
          selection.select(threads.list.data?.[0]?.id ?? null);
      });
    return () => {
      disposed = true;
    };
  }, [selection, threads.list.isSuccess, threads.list.data, workspaceId, recoverSubmission]);
  useEffect(() => {
    if (
      streaming ||
      !threads.detail.data ||
      threads.detail.data.thread.id !== selection.id ||
      loadedThread.current === selection.id
    )
      return;
    const detail = threads.detail.data;
    loadedThread.current = selection.id;
    setMessages(detail.messages);
    attachmentState.setAttachments(
      detail.roots.map((ref) => {
        return { ...ref, title: ref.type, path: "", emoji: null };
      }),
    );
  }, [threads.detail.data, selection.id, streaming, attachmentState]);
  const [chatError, setChatError] = useState<string | null>(null);
  const pendingRequest = useRef<ChatRequestInput | null>(null);
  const streamController = useRef<AbortController | null>(null);
  useLayoutEffect(
    () => () => {
      const controller = streamController.current;
      streamController.current = null;
      controller?.abort();
    },
    [],
  );
  useLayoutEffect(() => {
    // Query observers can briefly render an older revision after an imperative selection.
    if (!selection.isCurrent(selection.revision)) return;
    if (activeSelection.current === selection.revision) return;
    activeSelection.current = selection.revision;
    const controller = streamController.current;
    streamController.current = null;
    controller?.abort();
    setStreaming(false);
    setPendingTurn(null);
    if (controller) void threads.refresh();
    loadedThread.current = null;
    activeRun.current = null;
    pendingRequest.current = null;
    setText("");
    setMessages([]);
    setChatError(null);
    attachmentState.reset();
  }, [selection.revision, attachmentState, threads]);
  // Reloading or switching threads attaches a subscriber to the existing producer.
  const savedRun = threads.detail.data?.run;
  const followedRun = useRef<string | null>(null);
  useEffect(() => {
    if (
      !savedRun ||
      terminalChatRun(savedRun.status) ||
      !workspaceId ||
      savedRun.threadId !== selection.id ||
      streamController.current ||
      loadedThread.current !== selection.id
    )
      return;
    const followKey = `${selection.revision}:${savedRun.runId}`;
    if (followedRun.current === followKey) return;
    followedRun.current = followKey;
    const controller = new AbortController();
    const revision = selection.revision;
    streamController.current = controller;
    activeRun.current = savedRun;
    setStreaming(true);
    void follow(savedRun, workspaceId, controller.signal, (run) => {
      if (!selection.isCurrent(revision) || controller.signal.aborted) return;
      activeRun.current = run;
      setMessages((current) =>
        current.map((message) =>
          message.id === `${run.turnId}:assistant`
            ? {
                ...message,
                text: run.text,
                context: run.context,
                progress: run.progress,
                runId: run.runId,
                status: terminalChatRun(run.status) ? run.status : "streaming",
              }
            : message,
        ),
      );
    })
      .catch((cause) => {
        if (!controller.signal.aborted && selection.isCurrent(revision))
          setChatError(cause instanceof Error ? cause.message : "Could not reconnect to answer");
      })
      .finally(() => {
        if (streamController.current === controller) {
          streamController.current = null;
          setStreaming(false);
          void threads.refresh();
        }
      });
    // Scope changes are handled by the selection/unmount cleanup above. A query
    // refresh must not disconnect the currently owned subscription.
  }, [savedRun, workspaceId, selection, follow, threads]);
  const threadReady =
    selection.initialized && (selection.id === null || loadedThread.current === selection.id);
  const onSubmit = async (message: PromptInputMessage, continueFromRunId?: string) => {
    const continuedSources = continueFromRunId
      ? (messages.find((entry) => entry.runId === continueFromRunId)?.roots ??
        threads.detail.data?.roots ??
        [])
      : [];
    const mentioned = resolveChatReferences(message.text).roots;
    const marked =
      message.text +
      continuedSources
        .filter(
          (source) => !mentioned.some((ref) => ref.type === source.type && ref.id === source.id),
        )
        .map((source) => ` ${chatReferenceMarker(source)}`)
        .join("");
    const { text: normalizedText, roots } = resolveChatReferences(marked.trim());
    const nextText = normalizedText.trim();
    if (!nextText || !threadReady || streamController.current || streaming || !workspaceId) return;
    setChatError(null);
    activeRun.current = null;
    const controller = new AbortController();
    streamController.current = controller;
    const assistantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    setStreaming(true);
    setPendingTurn({
      messages: [
        {
          id: userId,
          role: "user",
          text: nextText,
          roots,
        },
        { id: assistantId, role: "assistant", text: "", status: "streaming" },
      ],
      label: "Thinking",
    });
    let requestSelection = selection.revision;
    let accepted = false;
    try {
      controller.signal.throwIfAborted();
      let nextRequest: ChatRequestInput = {
        workspaceId,
        requestId: crypto.randomUUID(),
        threadId: selection.id ?? undefined,
        text: nextText,
        ...(continueFromRunId ? { continueFromRunId } : {}),
      };
      const signature = (request: ChatRequestInput) =>
        JSON.stringify({
          workspaceId: request.workspaceId,
          threadId: request.threadId,
          text: request.text,
          continueFromRunId: request.continueFromRunId,
        });
      if (pendingRequest.current && signature(pendingRequest.current) === signature(nextRequest))
        nextRequest = pendingRequest.current;
      pendingRequest.current = nextRequest;
      await send(nextRequest, controller.signal, (event) => {
        if (!selection.isCurrent(requestSelection) || controller.signal.aborted) {
          controller.abort();
          return;
        }
        if (event.type === "context") {
          if (event.threadId) {
            loadedThread.current = event.threadId;
            if (event.threadId !== selection.id)
              requestSelection = selection.select(event.threadId).revision;
            activeSelection.current = requestSelection;
          }
          accepted = true;
          pendingRequest.current = null;
          setText("");
          setPendingTurn(null);
          setMessages((current) => [
            ...current,
            { id: userId, role: "user", text: nextText, roots },
            {
              id: assistantId,
              role: "assistant",
              text: "",
              roots,
              context: event.context,
              status: "streaming",
            },
          ]);
        } else if (event.type === "snapshot") {
          activeRun.current = event.run;
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    text: event.run.text,
                    context: event.run.context,
                    progress: event.run.progress,
                    runId: event.run.runId,
                    roots,
                    status: terminalChatRun(event.run.status) ? event.run.status : "streaming",
                  }
                : entry,
            ),
          );
        } else if (event.type === "read-progress") {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId
                ? { ...entry, context: event.context, progress: event.progress }
                : entry,
            ),
          );
        } else if (event.type === "debug") {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    debug: {
                      events: [...(entry.debug?.events ?? []), ...event.events],
                      omitted: event.omitted,
                    },
                  }
                : entry,
            ),
          );
        } else if (event.type === "replace-text") {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId ? { ...entry, text: event.text } : entry,
            ),
          );
        } else if (event.type === "delta")
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId ? { ...entry, text: entry.text + event.text } : entry,
            ),
          );
        else if (event.type === "done")
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantId ? { ...entry, status: event.status } : entry,
            ),
          );
      });
    } catch (cause) {
      if (streamController.current !== controller || !selection.isCurrent(requestSelection)) return;
      if (!controller.signal.aborted)
        setChatError(cause instanceof Error ? cause.message : "Could not send message");
      if (accepted && !activeRun.current)
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId
              ? { ...entry, status: controller.signal.aborted ? "stopped" : "failed" }
              : entry,
          ),
        );
      if (!controller.signal.aborted && !accepted) setText(text);
    } finally {
      if (streamController.current === controller) {
        streamController.current = null;
        setStreaming(false);
        setPendingTurn(null);
        void threads.refresh();
      }
    }
  };
  const visibleMessages = pendingTurn ? [...messages, ...pendingTurn.messages] : messages;
  const hasMessages = visibleMessages.length > 0;
  const retryAnswer = () => {
    const previous = [...messages].reverse().find((message) => message.role === "user");
    if (!previous) return;
    pendingRequest.current = null;
    const { text, roots } = resolveChatReferences(previous.text);
    const missing = (previous.roots ?? []).filter(
      (source) => !roots.some((ref) => ref.type === source.type && ref.id === source.id),
    );
    void onSubmit({
      text: text + missing.map((source) => ` ${chatReferenceMarker(source)}`).join(""),
      files: [],
    });
  };
  const centerEmptyState = !isSidebar && !hasMessages && threadReady;
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollEdgeThreshold={160}>
      <MessageScroller
        className={`relative flex h-full min-h-0 flex-col ${centerEmptyState ? "ask-ai-empty overflow-y-auto" : "overflow-visible"}`}
      >
        <MessageScrollerViewport
          data-ai-scroll-shell
          className={`h-auto w-full [scrollbar-gutter:auto] [contain:none] ${centerEmptyState ? "shrink-0 overflow-visible" : "min-h-0 flex-1 overflow-y-auto"}`}
        >
          <ChatLayout sidebar={isSidebar}>
            {!threadReady && !threads.detail.isError && <ChatLoading />}
            {threadReady && !hasMessages && (
              <ChatEmptyState name={session?.user?.name} onSelect={setText} />
            )}
            {threadReady && hasMessages && (
              <ChatbotMessages
                workspaceId={workspaceId}
                isSidebar={isSidebar}
                messages={visibleMessages}
                streaming={streaming}
                pendingLabel={pendingTurn?.label}
                onRetry={streaming ? undefined : retryAnswer}
                onContinue={
                  streaming
                    ? undefined
                    : (runId) => {
                        void onSubmit({ text: "Continue reading", files: [] }, runId);
                      }
                }
              />
            )}
          </ChatLayout>
        </MessageScrollerViewport>
        <ChatLayout sidebar={isSidebar}>
          {beforeComposer}
          {threads.detail.isError && (
            <div className="mb-2 flex items-center justify-between gap-2">
              <ChatError className="mb-0">{threads.detail.error.message}</ChatError>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void threads.detail.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          )}

          <ChatbotComposer
            key={selection.revision}
            isSidebar={isSidebar}
            onSubmit={(message) => onSubmit(message)}
            onTextChange={setText}
            workspaceId={workspaceId}
            attachments={attachmentState.attachments}
            onAttachmentsChange={attachmentState.replace}
            disabled={!threadReady || streaming}
            onStop={
              streaming
                ? () => {
                    const run = activeRun.current;
                    if (run && workspaceId) {
                      void cancelRun(run.runId, workspaceId).catch((cause) =>
                        setChatError(
                          cause instanceof Error ? cause.message : "Could not stop answer",
                        ),
                      );
                    } else streamController.current?.abort();
                  }
                : undefined
            }
            text={text}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {(pageId || databaseId) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    attachmentState.add({
                      id: databaseId || pageId!,
                      type: databaseId ? "database" : "page",
                      title: databaseId ? "Current database" : "Current page",
                      path: "",
                      emoji: null,
                    })
                  }
                >
                  Attach current {databaseId ? "database" : "page"}
                </Button>
              )}
            </div>
            {chatError && (
              <ChatError>
                {chatError}
                {activeRun.current && !terminalChatRun(activeRun.current.status) && !streaming && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      followedRun.current = null;
                      loadedThread.current = null;
                      setChatError(null);
                      void threads.refresh();
                    }}
                  >
                    Reconnect
                  </Button>
                )}
              </ChatError>
            )}
            {!streaming && ["failed", "interrupted"].includes(messages.at(-1)?.status ?? "") && (
              <Button type="button" size="sm" variant="ghost" onClick={retryAnswer}>
                Retry answer
              </Button>
            )}
          </ChatbotComposer>
        </ChatLayout>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
