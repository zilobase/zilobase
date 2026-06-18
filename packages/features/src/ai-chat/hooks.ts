import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import { useActiveOrganizationId } from "../integrations/hooks"
import {
  aiChatThreadMessagesQueryKey,
  aiChatThreadsQueryKey,
  aiChatThreadsQueryOptions,
  type AiChatThread,
  type AiChatThreadResponse,
  type AiChatThreadsResponse,
} from "./queries"

export function useAiChatThreads() {
  const { apiFetch } = useNotelabFeatures()
  const organizationId = useActiveOrganizationId()

  return useQuery(aiChatThreadsQueryOptions(apiFetch, organizationId))
}

export function useCreateAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const organizationId = useActiveOrganizationId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input?: { title?: string }) =>
      apiFetch<AiChatThreadResponse>("/api/ai/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(organizationId
            ? { "x-notelab-organization-id": organizationId }
            : {}),
        },
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(organizationId),
      })
    },
  })
}

export function useRenameAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const organizationId = useActiveOrganizationId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { threadId: string; title: string }) =>
      apiFetch<AiChatThreadResponse>(
        `/api/ai/threads/${encodeURIComponent(input.threadId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(organizationId
              ? { "x-notelab-organization-id": organizationId }
              : {}),
          },
          body: JSON.stringify({ title: input.title }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(organizationId),
      })
    },
  })
}

export function useArchiveAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const organizationId = useActiveOrganizationId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/ai/threads/${encodeURIComponent(threadId)}/archive`,
        {
          method: "POST",
          headers: organizationId
            ? { "x-notelab-organization-id": organizationId }
            : undefined,
        },
      ),
    onSuccess: (_result, threadId) => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(organizationId),
      })
      queryClient.removeQueries({
        queryKey: aiChatThreadMessagesQueryKey(organizationId, threadId),
      })
    },
  })
}

export function useDeleteAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const organizationId = useActiveOrganizationId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/ai/threads/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
          headers: organizationId
            ? { "x-notelab-organization-id": organizationId }
            : undefined,
        },
      ),
    onSuccess: (_result, threadId) => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(organizationId),
      })
      queryClient.removeQueries({
        queryKey: aiChatThreadMessagesQueryKey(organizationId, threadId),
      })
    },
  })
}

export function upsertAiChatThreadInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string | null | undefined,
  thread: AiChatThread,
) {
  queryClient.setQueryData<AiChatThreadsResponse>(
    aiChatThreadsQueryKey(organizationId),
    (current) => {
      const threads = current?.threads ?? []
      const nextThreads = [
        thread,
        ...threads.filter((item) => item.id !== thread.id),
      ]

      return { threads: nextThreads }
    },
  )
}