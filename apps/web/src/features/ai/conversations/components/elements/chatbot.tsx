import { aiChatThreadMessagesQueryOptions } from "@zilobase/features/ai-chat";

import { useZilobaseFeatures } from "@zilobase/features";

import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";

import { useQuery } from "@tanstack/react-query";

import { type UIMessage } from "ai";

import { useEffect, useState } from "react";

import { emptyAgentChatMessages } from "../../model/chat-runtime-model";
import { ChatbotConversationController } from "../chatbot-conversation";
import type { ChatbotProps } from "../../conversation-interface";
export type { PendingInitialChatSubmission } from "../../conversation-interface";

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

export default Chatbot;
