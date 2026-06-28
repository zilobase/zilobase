import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import { useActiveWorkspaceId } from "../integrations/hooks"
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
  const workspaceId = useActiveWorkspaceId()

  return useQuery(aiChatThreadsQueryOptions(apiFetch, workspaceId))
}

export function useCreateAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input?: { title?: string }) =>
      apiFetch<AiChatThreadResponse>("/api/ai/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workspaceId
            ? { "x-notelab-workspace-id": workspaceId }
            : {}),
        },
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(workspaceId),
      })
    },
  })
}

export function useRenameAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { threadId: string; title: string }) =>
      apiFetch<AiChatThreadResponse>(
        `/api/ai/threads/${encodeURIComponent(input.threadId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(workspaceId
              ? { "x-notelab-workspace-id": workspaceId }
              : {}),
          },
          body: JSON.stringify({ title: input.title }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(workspaceId),
      })
    },
  })
}

export function useArchiveAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/ai/threads/${encodeURIComponent(threadId)}/archive`,
        {
          method: "POST",
          headers: workspaceId
            ? { "x-notelab-workspace-id": workspaceId }
            : undefined,
        },
      ),
    onSuccess: (_result, threadId) => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(workspaceId),
      })
      queryClient.removeQueries({
        queryKey: aiChatThreadMessagesQueryKey(workspaceId, threadId),
      })
    },
  })
}

export function useDeleteAiChatThread() {
  const { apiFetch } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/ai/threads/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
          headers: workspaceId
            ? { "x-notelab-workspace-id": workspaceId }
            : undefined,
        },
      ),
    onSuccess: (_result, threadId) => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(workspaceId),
      })
      queryClient.removeQueries({
        queryKey: aiChatThreadMessagesQueryKey(workspaceId, threadId),
      })
    },
  })
}

export function upsertAiChatThreadInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string | null | undefined,
  thread: AiChatThread,
) {
  queryClient.setQueryData<AiChatThreadsResponse>(
    aiChatThreadsQueryKey(workspaceId),
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