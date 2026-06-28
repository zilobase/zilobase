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
  workspaceId: string | null | undefined,
) => ["workspaces", workspaceId ?? "none", "ai-chat", "threads"] as const

export const aiChatThreadMessagesQueryKey = (
  workspaceId: string | null | undefined,
  threadId: string | null | undefined,
) =>
  [
    "workspaces",
    workspaceId ?? "none",
    "ai-chat",
    "threads",
    threadId ?? "none",
    "messages",
  ] as const

export const aiChatThreadsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: aiChatThreadsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: ({ signal }) =>
      apiFetch<AiChatThreadsResponse>(
        "/api/ai/threads",
        integrationRequestOptions(workspaceId, { signal }),
      ),
  })

export const aiChatThreadMessagesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  threadId: string | null | undefined,
) =>
  queryOptions({
    queryKey: aiChatThreadMessagesQueryKey(workspaceId, threadId),
    enabled: Boolean(workspaceId && threadId),
    queryFn: ({ signal }) =>
      apiFetch<AiChatThreadMessagesResponse>(
        `/api/ai/threads/${encodeURIComponent(threadId!)}/messages`,
        integrationRequestOptions(workspaceId, { signal }),
      ),
  })
