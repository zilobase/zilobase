import { queryOptions } from "@tanstack/react-query"

import { ApiError, apiFetch } from "@/lib/api"

export type WorkspaceMetadata = {
  emoji?: string | null
}

export type Workspace = {
  id: string
  organizationId: string
  createdById?: string | null
  type: string
  name: string
  url: string
  content?: unknown
  metadata?: WorkspaceMetadata | null
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export const workspacesQueryKey = (organizationId: string | null | undefined) =>
  ["workspaces", organizationId ?? "none"] as const

export const workspaceQueryKey = (workspaceId: string | null | undefined) =>
  ["workspace", workspaceId ?? "none"] as const

export const workspacesQueryOptions = (
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspacesQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return []
      }

      try {
        const result = await apiFetch<{ workspaces: Workspace[] }>(
          `/workspaces?organizationId=${encodeURIComponent(organizationId)}`,
          { method: "GET" },
        )

        return result.workspaces
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return []
        }

        throw error
      }
    },
  })

export const workspaceQueryOptions = (workspaceId: string | null | undefined) =>
  queryOptions({
    queryKey: workspaceQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error("workspaceId is required")
      }

      const result = await apiFetch<{ workspace: Workspace }>(
        `/workspaces/${workspaceId}`,
        { method: "GET" },
      )

      return result.workspace
    },
  })

export function getWorkspaceEmoji(workspace: Pick<Workspace, "metadata">) {
  return workspace.metadata?.emoji || "📝"
}
