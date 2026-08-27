import { useMutation, useQuery } from "@tanstack/react-query"

import { useSession } from "../auth/hooks"
import { useZilobaseFeatures } from "../context"
import { workspacesQueryOptions } from "../workspaces/queries"
import {
  aiModelsQueryKey,
  aiModelsQueryOptions,
  aiProvidersQueryKey,
  aiProvidersQueryOptions,
  workspaceRequestOptions,
  type WorkspaceAiProvidersResponse,
} from "./queries"

export function useWorkspaceAiModels() {
  const { apiFetch } = useZilobaseFeatures()

  return useQuery(aiModelsQueryOptions(apiFetch, useActiveWorkspaceId()))
}

export function useWorkspaceAiProviders() {
  const { apiFetch } = useZilobaseFeatures()

  return useQuery(aiProvidersQueryOptions(apiFetch, useActiveWorkspaceId()))
}

export function useUpdateWorkspaceAiProvider() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: ({
      input,
      providerId,
    }: {
      providerId: string
      input: {
        apiKey?: string
        baseUrl?: string
        enabled: boolean
        modelIds?: string[]
      }
    }) =>
      apiFetch<WorkspaceAiProvidersResponse>(
        `/api/workspace/settings/ai/providers/${encodeURIComponent(providerId)}`,
        {
          ...workspaceRequestOptions(workspaceId),
          method: "PUT",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiProvidersQueryKey(workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: aiModelsQueryKey(workspaceId),
        }),
      ])
    },
  })
}

export function useActiveWorkspaceId() {
  const { auth, preferredActiveWorkspaceId } = useZilobaseFeatures()
  const { data: sessionData } = useSession()
  const { data: workspaces = [] } = useQuery(workspacesQueryOptions(auth))
  const sessionWorkspaceId = sessionData?.session?.activeWorkspaceId ?? null
  const storedWorkspace = workspaces.find(
    (workspace) => workspace.id === preferredActiveWorkspaceId,
  )
  const sessionWorkspace = workspaces.find(
    (workspace) => workspace.id === sessionWorkspaceId,
  )

  return (
    storedWorkspace?.id ??
    sessionWorkspace?.id ??
    workspaces[0]?.id ??
    sessionWorkspaceId ??
    preferredActiveWorkspaceId
  )
}
