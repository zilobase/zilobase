"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import { getApiRequestHeaders, toApiUrl } from "@/lib/api";

export function useAgentConversation(input: {
  id: string;
  initialMessages: UIMessage[];
  onError(error: Error): void;
  threadId: string | null;
  workspaceId: string | null;
}) {
  return useChat<UIMessage>({
    experimental_throttle: 50,
    id: input.id,
    messages: input.initialMessages,
    onError: input.onError,
    transport: new DefaultChatTransport<UIMessage>({
      api: toApiUrl("/api/ai/threads/unresolved/turns"),
      credentials: "include",
      headers: () => {
        const headers = getApiRequestHeaders();
        if (input.workspaceId) {
          headers.set("x-zilobase-workspace-id", input.workspaceId);
        }
        return headers;
      },
      prepareSendMessagesRequest: ({ body, messages }) => {
        const latest = messages.at(-1);
        if (!latest || latest.role !== "user") {
          throw new Error("Only a new user message can create an AI turn.");
        }
        const requestThreadId = typeof body?.threadId === "string"
          ? body.threadId
          : input.threadId;
        if (!requestThreadId) throw new Error("A chat thread is required.");
        const text = latest.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n")
          .trim();
        if (!text) throw new Error("A text prompt is required.");

        return {
          api: toApiUrl(`/api/ai/threads/${encodeURIComponent(requestThreadId)}/turns`),
          body: {
            attachmentIds: Array.isArray(body?.attachmentIds) ? body.attachmentIds : [],
            clientMessageId: latest.id,
            clientTurnId: typeof body?.clientTurnId === "string"
              ? body.clientTurnId
              : crypto.randomUUID(),
            contextRefs: Array.isArray(body?.contextRefs) ? body.contextRefs : [],
            mentionedUserIds: Array.isArray(body?.mentionedUserIds)
              ? body.mentionedUserIds
              : [],
            modelId: typeof body?.modelId === "string" ? body.modelId : "auto",
            text,
          },
        };
      },
    }),
  });
}
