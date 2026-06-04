import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import {
  defaultUserSettings,
  userSettingsQueryKey,
  type UserSettings,
} from "../user-settings/queries"
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
} from "./queries"

type CreateWorkspaceInput = {
  content?: unknown
  metadata?: WorkspaceMetadata
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
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspacesQueryOptions(apiFetch, organizationId))
}

export function useWorkspace(workspaceId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspaceQueryOptions(apiFetch, workspaceId))
}

export function useWorkspaceAccessLevel(
  workspaceId: string | null | undefined,
) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspaceAccessLevelQueryOptions(apiFetch, workspaceId))
}

export function useWorkspaceAccess(workspaceId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspaceAccessQueryOptions(apiFetch, workspaceId))
}

export function useWorkspaceAccessTargets(
  organizationId: string | null | undefined,
) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspaceAccessTargetsQueryOptions(apiFetch, organizationId))
}

export function useWorkspacePersonAccessTargets(
  workspaceId: string | null | undefined,
) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspacePersonAccessTargetsQueryOptions(apiFetch, workspaceId))
}

export function useWorkspaceProperties(workspaceId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspacePropertiesQueryOptions(apiFetch, workspaceId))
}

export function useCreateWorkspace() {
  const { apiFetch, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: async ({
      content = null,
      organizationId,
      name = "",
      emoji,
      metadata: inputMetadata,
      parentWorkspaceId,
    }: CreateWorkspaceInput) => {
      const userSettings =
        queryClient.getQueryData<UserSettings>(userSettingsQueryKey) ??
        defaultUserSettings
      const metadata: WorkspaceMetadata = {
        fullWidth: Boolean(userSettings.workspaceFullWidth),
        useUserFullWidthPreference: true,
        ...(inputMetadata ?? {}),
      }

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
          metadata,
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
  const { apiFetch, queryClient } = useNotelabFeatures()

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
  const { apiFetch, queryClient } = useNotelabFeatures()

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
  const { apiFetch, queryClient } = useNotelabFeatures()

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
  const { apiFetch, queryClient } = useNotelabFeatures()

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
  const { apiFetch, queryClient } = useNotelabFeatures()

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
  const { apiFetch, queryClient } = useNotelabFeatures()

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
