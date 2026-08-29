import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import { useActiveWorkspaceId } from "../workspaces/hooks"
import {
  aiChatThreadMessagesQueryKey,
  aiAgentPreferenceQueryKey,
  aiAgentPreferenceQueryOptions,
  aiChatThreadsQueryKey,
  aiChatThreadsQueryOptions,
  type AiChatThread,
  type AiChatThreadResponse,
  type AiChatThreadMessagesResponse,
  type AiChatThreadsResponse,
  type AiAgentPreference,
  type AiChatFeedback,
} from "./queries"

export function useAiChatThreads(options?: { enabled?: boolean; search?: string }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useQuery({
    ...aiChatThreadsQueryOptions(apiFetch, workspaceId, options?.search),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  })
}

export function useAiAgentPreference() {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useQuery(aiAgentPreferenceQueryOptions(apiFetch, workspaceId))
}

export function useUpdateAiAgentPreference() {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (preference: AiAgentPreference) =>
      apiFetch<{ preference: AiAgentPreference }>("/api/ai/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(workspaceId
            ? { "x-zilobase-workspace-id": workspaceId }
            : {}),
        },
        body: JSON.stringify(preference),
      }).then((result) => result.preference),
    onSuccess: (preference) => {
      queryClient.setQueryData(
        aiAgentPreferenceQueryKey(workspaceId),
        preference,
      )
    },
  })
}

export function useCreateAiChatThread() {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input?: { title?: string }) =>
      apiFetch<AiChatThreadResponse>("/api/ai/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workspaceId
            ? { "x-zilobase-workspace-id": workspaceId }
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
  const { apiFetch } = useZilobaseFeatures()
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
              ? { "x-zilobase-workspace-id": workspaceId }
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
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/ai/threads/${encodeURIComponent(threadId)}/archive`,
        {
          method: "POST",
          headers: workspaceId
            ? { "x-zilobase-workspace-id": workspaceId }
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

export function useSetAiChatThreadPinned() {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { pinned: boolean; threadId: string }) =>
      apiFetch<AiChatThreadResponse>(
        `/api/ai/threads/${encodeURIComponent(input.threadId)}/pin`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(workspaceId
              ? { "x-zilobase-workspace-id": workspaceId }
              : {}),
          },
          body: JSON.stringify({ pinned: input.pinned }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: aiChatThreadsQueryKey(workspaceId),
      })
    },
  })
}

export function useSubmitAiChatFeedback() {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      messageId: string
      rating: -1 | 1
      reason?: string
      threadId: string
    }) =>
      apiFetch<{ feedback: AiChatFeedback }>(
        `/api/ai/threads/${encodeURIComponent(input.threadId)}/messages/${encodeURIComponent(input.messageId)}/feedback`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(workspaceId
              ? { "x-zilobase-workspace-id": workspaceId }
              : {}),
          },
          body: JSON.stringify({ rating: input.rating, reason: input.reason }),
        },
      ),
    onSuccess: ({ feedback }, input) => {
      queryClient.setQueryData<AiChatThreadMessagesResponse>(
        aiChatThreadMessagesQueryKey(workspaceId, input.threadId),
        (current) => current
          ? {
              ...current,
              feedback: [
                ...current.feedback.filter(
                  (item) => item.messageId !== feedback.messageId,
                ),
                feedback,
              ],
            }
          : current,
      )
    },
  })
}

export function useDeleteAiChatThread() {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/ai/threads/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
          headers: workspaceId
            ? { "x-zilobase-workspace-id": workspaceId }
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
