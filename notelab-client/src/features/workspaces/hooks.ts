import { useMutation, useQuery } from "@tanstack/react-query"

import {
  workspaceQueryKey,
  workspaceQueryOptions,
  workspaceAccessQueryKey,
  workspaceAccessQueryOptions,
  workspaceAccessLevelQueryOptions,
  workspaceAccessTargetsQueryOptions,
  workspacePersonAccessTargetsQueryOptions,
  workspacePropertiesQueryKey,
  workspacePropertiesQueryOptions,
  workspacesQueryKey,
  workspacesQueryOptions,
  type AccessLevel,
  type AccessTargetType,
  type Workspace,
  type WorkspaceMetadata,
  type WorkspacePropertiesPayload,
} from "@/features/workspaces/queries"
import { apiFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

type CreateWorkspaceInput = {
  content?: unknown
  organizationId: string
  name?: string
  emoji?: string
  parentWorkspaceId?: string
}

type UpdateWorkspaceInput = {
  id: string
  content?: unknown
  name?: string
  metadata?: WorkspaceMetadata
}

type UpdateWorkspacePropertyValueInput = {
  propertyId: string
  value: unknown
  workspaceId: string
}

type UpsertWorkspaceAccessInput = {
  accessLevel: AccessLevel
  targetId: string
  targetType: AccessTargetType
  workspaceId: string
}

type SetWorkspacePublishedInput = {
  isPublished: boolean
  workspaceId: string
}

type SetWorkspaceFavoriteInput = {
  isFavorite: boolean
  workspaceId: string
}

export function useWorkspaces(organizationId: string | null | undefined) {
  return useQuery(workspacesQueryOptions(organizationId))
}

export function useWorkspace(workspaceId: string | null | undefined) {
  return useQuery(workspaceQueryOptions(workspaceId))
}

export function useWorkspaceAccessLevel(
  workspaceId: string | null | undefined,
) {
  return useQuery(workspaceAccessLevelQueryOptions(workspaceId))
}

export function useWorkspaceAccess(workspaceId: string | null | undefined) {
  return useQuery(workspaceAccessQueryOptions(workspaceId))
}

export function useWorkspaceAccessTargets(
  organizationId: string | null | undefined,
) {
  return useQuery(workspaceAccessTargetsQueryOptions(organizationId))
}

export function useWorkspacePersonAccessTargets(
  workspaceId: string | null | undefined,
) {
  return useQuery(workspacePersonAccessTargetsQueryOptions(workspaceId))
}

export function useWorkspaceProperties(workspaceId: string | null | undefined) {
  return useQuery(workspacePropertiesQueryOptions(workspaceId))
}

export function useCreateWorkspace() {
  return useMutation({
    mutationFn: async ({
      content = null,
      organizationId,
      name = "",
      emoji,
      parentWorkspaceId,
    }: CreateWorkspaceInput) => {
      const metadata: WorkspaceMetadata = {}

      if (emoji) {
        metadata.emoji = emoji
      }

      if (parentWorkspaceId) {
        metadata.parentWorkspaceId = parentWorkspaceId
      }

      const result = await apiFetch<{ workspace: Workspace }>("/workspaces", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          name,
          type: "pageblock",
          url: "#",
          content,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        }),
      })

      return result.workspace
    },
    onSuccess: async (workspace) => {
      queryClient.setQueryData<Workspace | null>(
        workspaceQueryKey(workspace.id),
        (current) => ({
          ...(current ?? {}),
          ...workspace,
          isFavorite: workspace.isFavorite ?? current?.isFavorite,
          isTeamspace: workspace.isTeamspace ?? current?.isTeamspace,
        }),
      )
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(workspace.organizationId),
      })
    },
  })
}

export function useUpsertWorkspaceAccess() {
  return useMutation({
    mutationFn: async ({
      accessLevel,
      targetId,
      targetType,
      workspaceId,
    }: UpsertWorkspaceAccessInput) => {
      const result = await apiFetch<{ access: unknown }>(
        `/workspaces/${workspaceId}/access`,
        {
          method: "PUT",
          body: JSON.stringify({ accessLevel, targetId, targetType }),
        },
      )

      return result.access
    },
    onSuccess: async (_access, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceAccessQueryKey(variables.workspaceId),
        }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      ])
    },
  })
}

export function useDeleteWorkspaceAccess() {
  return useMutation({
    mutationFn: async ({
      ruleId,
      workspaceId,
    }: {
      ruleId: string
      workspaceId: string
    }) =>
      apiFetch<{ access: unknown }>(
        `/workspaces/${workspaceId}/access/${ruleId}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_access, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceAccessQueryKey(variables.workspaceId),
        }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      ])
    },
  })
}

export function useSetWorkspacePublished() {
  return useMutation({
    mutationFn: async ({
      isPublished,
      workspaceId,
    }: SetWorkspacePublishedInput) => {
      if (isPublished) {
        const result = await apiFetch<{ access: unknown }>(
          `/workspaces/${workspaceId}/access`,
          {
            method: "PUT",
            body: JSON.stringify({
              accessLevel: "view",
              targetId: "*",
              targetType: "public",
            }),
          },
        )

        return result.access
      }

      return apiFetch<{ access: unknown }>(
        `/workspaces/${workspaceId}/access/public`,
        { method: "DELETE" },
      )
    },
    onSuccess: async (_access, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceAccessQueryKey(variables.workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: [...workspaceQueryKey(variables.workspaceId), "access-level"],
        }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      ])
    },
  })
}

export function useUpdateWorkspace() {
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateWorkspaceInput) => {
      const result = await apiFetch<{ workspace: Workspace }>(
        `/workspaces/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      )

      return result.workspace
    },
    onSuccess: async (workspace) => {
      queryClient.setQueryData(workspaceQueryKey(workspace.id), workspace)
      await queryClient.invalidateQueries({
        queryKey: workspacesQueryKey(workspace.organizationId),
      })
    },
  })
}

export function useSetWorkspaceFavorite() {
  return useMutation({
    mutationFn: async ({
      isFavorite,
      workspaceId,
    }: SetWorkspaceFavoriteInput) => {
      const result = await apiFetch<{ workspace: Workspace }>(
        `/workspaces/${workspaceId}/favorite`,
        { method: isFavorite ? "PUT" : "DELETE" },
      )

      return result.workspace
    },
    onSuccess: async (workspace) => {
      queryClient.setQueryData(workspaceQueryKey(workspace.id), workspace)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["database"] }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      ])
    },
  })
}

export function useUpdateWorkspacePropertyValue() {
  return useMutation({
    mutationFn: async ({
      propertyId,
      value,
      workspaceId,
    }: UpdateWorkspacePropertyValueInput) =>
      apiFetch<WorkspacePropertiesPayload>(
        `/workspaces/${workspaceId}/properties/${propertyId}/value`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        },
      ),
    onSuccess: (payload, variables) => {
      queryClient.setQueryData(
        workspacePropertiesQueryKey(variables.workspaceId),
        payload,
      )
    },
  })
}
