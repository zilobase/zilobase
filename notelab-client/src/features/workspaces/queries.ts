import { queryOptions } from "@tanstack/react-query"

import { ApiError, apiFetch } from "@/lib/api"

export type WorkspaceMetadata = {
  emoji?: string | null
  parentWorkspaceId?: string | null
}

export type Workspace = {
  id: string
  isTeamspace?: boolean
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

export type WorkspaceProperty = {
  id: string
  organizationId: string
  name: string
  type: string
  config?: unknown
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type WorkspacePropertyValue = {
  id: string
  workspaceId: string
  propertyId: string
  value: unknown
  createdAt: string
  updatedAt: string
}

export type WorkspacePropertiesPayload = {
  properties: WorkspaceProperty[]
  values: WorkspacePropertyValue[]
}

export type AccessLevel = "view" | "edit" | "full"

export type AccessTargetType = "user" | "team"

export type WorkspaceAccessRule = {
  id: string
  organizationId: string
  workspaceId: string
  targetType: AccessTargetType
  targetId: string
  accessLevel: AccessLevel
  createdAt: string
  updatedAt: string
}

export type WorkspaceAccessPayload = {
  access: WorkspaceAccessRule[]
}

export type WorkspaceAccessTargetMember = {
  email: string
  id: string
  memberId: string
  name: string
  role: string
}

export type WorkspaceAccessTargetTeam = {
  id: string
  name: string
}

export type WorkspaceAccessTargetsPayload = {
  members: WorkspaceAccessTargetMember[]
  teams: WorkspaceAccessTargetTeam[]
}

export const workspacesQueryKey = (organizationId: string | null | undefined) =>
  ["workspaces", organizationId ?? "none"] as const

export const workspaceQueryKey = (workspaceId: string | null | undefined) =>
  ["workspace", workspaceId ?? "none"] as const

export const workspacePropertiesQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace-properties", workspaceId ?? "none"] as const

export const workspaceAccessQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace-access", workspaceId ?? "none"] as const

export const workspaceAccessTargetsQueryKey = (
  organizationId: string | null | undefined,
) => ["workspace-access-targets", organizationId ?? "none"] as const

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

      try {
        const result = await apiFetch<{
          accessLevel?: AccessLevel
          workspace: Workspace
        }>(
          `/workspaces/${workspaceId}`,
          { method: "GET" },
        )

        return result.workspace
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 401 ||
            error.status === 403 ||
            error.status === 404)
        ) {
          return null
        }

        throw error
      }
    },
  })

export const workspaceAccessQueryOptions = (
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceAccessQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        return { access: [] }
      }

      try {
        return await apiFetch<WorkspaceAccessPayload>(
          `/workspaces/${workspaceId}/access`,
          { method: "GET" },
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          return { access: [] }
        }

        throw error
      }
    },
  })

export const workspaceAccessTargetsQueryOptions = (
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceAccessTargetsQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return { members: [], teams: [] }
      }

      return apiFetch<WorkspaceAccessTargetsPayload>(
        `/organizations/${organizationId}/access-targets`,
        { method: "GET" },
      )
    },
  })

export const workspaceAccessLevelQueryOptions = (
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: [...workspaceQueryKey(workspaceId), "access-level"] as const,
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        return null
      }

      try {
        const result = await apiFetch<{
          accessLevel?: AccessLevel
          workspace: Workspace
        }>(
        `/workspaces/${workspaceId}`,
        { method: "GET" },
      )

        return result.accessLevel ?? null
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 401 ||
            error.status === 403 ||
            error.status === 404)
        ) {
          return null
        }

        throw error
      }
    },
  })

export const workspacePropertiesQueryOptions = (
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspacePropertiesQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error("workspaceId is required")
      }

      return apiFetch<WorkspacePropertiesPayload>(
        `/workspaces/${workspaceId}/properties`,
        { method: "GET" },
      )
    },
  })

export function getWorkspaceEmoji(workspace: Pick<Workspace, "metadata">) {
  return workspace.metadata?.emoji ?? null
}
