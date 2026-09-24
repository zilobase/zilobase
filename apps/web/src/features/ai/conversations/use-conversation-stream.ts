import { useCallback, useEffect, useRef, useState } from "react";
import { type UIMessage, isToolUIPart } from "ai";
import { isAgentProgressPart, type AgentSettingsEvent } from "@zilobase/features/ai-chat";
import { useAgentConversation } from "@zilobase/ai-conversation-adapter";
import { getApiRequestHeaders, resolveApiBaseUrl } from "@/platform/network/api";
import { emitSettingsEvent } from "../settings/use-settings-draft";
import { useAgentLiveEffects } from "./effects/use-agent-live-effects";
import { useAgentLiveDebugger } from "./components/elements/agent-live-debugger";
import { useAiDevTrace, useAiDevMessageTrace } from "../debug/use-ai-dev-trace";
import { logAiChatError, summarizeMessagesForDebug } from "./model/chat-runtime-model";
import { toast } from "sonner";

export function useConversationStream({
  initialMessages,
  conversationId,
  canApplyPageEdits,
  isAgentReady,
  isSidebar,
  workspaceId,
  threadId,
  userId,
  pageContextChars,
  pageId,
  databaseId,
}: {
  initialMessages: UIMessage[];
  conversationId: string;
  canApplyPageEdits: boolean;
  isAgentReady: boolean;
  isSidebar: boolean;
  workspaceId: string | null;
  threadId: string | null;
  userId: string | null;
  pageContextChars: number;
  pageId: string | null;
  databaseId: string | null;
}) {
  const [feedbackReadyMessageIds, setFeedbackReadyMessageIds] = useState(
    () =>
      new Set(
        initialMessages
          .filter((message) => message.role === "assistant")
          .map((message) => message.id),
      ),
  );
  const handleAgentData = useAgentLiveEffects();
  const liveDebugger = useAgentLiveDebugger();
  const devTrace = useAiDevTrace({ threadId, workspaceId });
  const debugContextRef = useRef<Record<string, unknown>>({});
  const handleAgentStreamData = useCallback(
    (part: { data: unknown; type: string }) => {
      if (part.type === "data-agent-settings") emitSettingsEvent(part.data as AgentSettingsEvent);
      handleAgentData(part);
      liveDebugger.onData(part);
      devTrace.record("stream-data", part);
    },
    [devTrace.record, handleAgentData, liveDebugger.onData],
  );

  const { clearError, error, messages, sendMessage, setMessages, status, stop } =
    useAgentConversation({
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
          pageContextChars: pageContextChars,
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
      pageContextChars: pageContextChars,
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
    pageContextChars,
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
      logAiChatError("unhandled rejection", event.reason, debugContextRef.current);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

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

  return {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    feedbackReadyMessageIds,
    liveDebugger,
    devTrace,
  };
}
