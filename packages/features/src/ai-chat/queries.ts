import { queryOptions } from "@tanstack/react-query"
import type { UIMessage } from "ai"

import type { ApiFetcher } from "../context"
import { integrationRequestOptions } from "../integrations/queries"

export type AiChatThread = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastActivityAt: string
}

export type AiChatThreadsResponse = {
  threads: AiChatThread[]
}

export type AiChatThreadResponse = {
  thread: AiChatThread
}

export type AiChatThreadMessagesResponse = {
  messages: UIMessage[]
  thread: AiChatThread
}

export const aiChatThreadsQueryKey = (
  organizationId: string | null | undefined,
) => ["ai-chat-threads", organizationId] as const

export const aiChatThreadMessagesQueryKey = (
  organizationId: string | null | undefined,
  threadId: string | null | undefined,
) => ["ai-chat-thread-messages", organizationId, threadId] as const

export const aiChatThreadsQueryOptions = (
  apiFetch: ApiFetcher,
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: aiChatThreadsQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: () =>
      apiFetch<AiChatThreadsResponse>(
        "/api/ai/threads",
        integrationRequestOptions(organizationId),
      ),
  })

export const aiChatThreadMessagesQueryOptions = (
  apiFetch: ApiFetcher,
  organizationId: string | null | undefined,
  threadId: string | null | undefined,
) =>
  queryOptions({
    queryKey: aiChatThreadMessagesQueryKey(organizationId, threadId),
    enabled: Boolean(organizationId && threadId),
    queryFn: () =>
      apiFetch<AiChatThreadMessagesResponse>(
        `/api/ai/threads/${encodeURIComponent(threadId!)}/messages`,
        integrationRequestOptions(organizationId),
      ),
  })