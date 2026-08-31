"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  prepareAgentTurnRequest,
  type AgentConversationInput,
} from "@zilobase/features/ai-chat/conversation-adapter";

import { getApiRequestHeaders, toApiUrl } from "@/features/desktop/network/api";

export function useHttpAgentConversation(input: AgentConversationInput) {
  return useChat<UIMessage>({
    experimental_throttle: 16,
    id: input.id,
    messages: input.initialMessages,
    onData: input.onData,
    onError: input.onError,
    onFinish: input.onFinish,
    transport: new DefaultChatTransport<UIMessage>({
      api: toApiUrl("/api/ai/threads/unresolved/turns"),
      credentials: "include",
      headers: () => {
        const headers = getApiRequestHeaders(input.headers);
        if (input.workspaceId) {
          headers.set("x-zilobase-workspace-id", input.workspaceId);
        }
        return headers;
      },
      prepareSendMessagesRequest: ({ body, messages }) => {
        const prepared = prepareAgentTurnRequest({
          body,
          messages,
          threadId: input.threadId,
        });

        return {
          api: toApiUrl(
            `/api/ai/threads/${encodeURIComponent(prepared.requestThreadId)}/turns`,
          ),
          body: prepared.body,
        };
      },
    }),
  });
}
