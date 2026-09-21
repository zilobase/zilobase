"use client";

import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  prepareAgentTurnRequest,
  type AgentConversationInput,
} from "@zilobase/features/ai-chat/conversation-adapter";
import { buildChatAgentInstanceName } from "@zilobase/features/ai-chat/agent-room";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";


export function useAgentConversation(input: AgentConversationInput) {
  const ready = Boolean(input.threadId && input.userId && input.workspaceId);
  const agent = useAgent({
    agent: "ChatAgent",
    host: resolveAgentHost(input.apiBaseUrl),
    name: ready
      ? buildChatAgentInstanceName({
          threadId: input.threadId!,
          userId: input.userId!,
          workspaceId: input.workspaceId!,
        })
      : "chat-not-ready",
    query: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    queryDeps: [input.workspaceId],
    startClosed: !ready,
  });

  const chat = useAgentChat<unknown, UIMessage>({
    agent,
    credentials: "include",
    experimental_throttle: 16,
    getInitialMessages: null,
    headers: input.headers,
    id: input.id,
    messages: input.initialMessages,
    onData: input.onData,
    onError: input.onError,
    onFinish: input.onFinish,
    prepareSendMessagesRequest: ({ body, messages }) => {
      const prepared = prepareAgentTurnRequest({
        body,
        messages,
        threadId: input.threadId,
      });

      return { body: prepared.body };
    },
    resume: true,
  });

  return {
    ...chat,
    status: chat.isStreaming && chat.status === "ready"
      ? "streaming" as const
      : chat.status,
  };
}

function resolveAgentHost(apiBaseUrl: string | undefined) {
  if (!apiBaseUrl || typeof window === "undefined") return undefined;

  return new URL(apiBaseUrl, window.location.origin).host;
}
