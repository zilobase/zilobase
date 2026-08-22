import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../context"
import { pagesQueryKey } from "../pages/queries"
import {
  teamspacePrincipalsQueryKey,
  teamspacePrincipalsQueryOptions,
  teamspaceSettingsQueryKey,
  teamspaceSettingsQueryOptions,
  teamspacesQueryKey,
  teamspacesQueryOptions,
  type Teamspace,
  type TeamspaceAccessMode,
  type TeamspaceRole,
} from "./queries"

export function useTeamspaces(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(teamspacesQueryOptions(apiFetch, workspaceId))
}

export function useTeamspaceSettings(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(teamspaceSettingsQueryOptions(apiFetch, workspaceId))
}

export function useTeamspacePrincipals(
  workspaceId: string | null | undefined,
  teamspaceId: string | null | undefined,
) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery(
    teamspacePrincipalsQueryOptions(apiFetch, workspaceId, teamspaceId),
  )
}

export function useCreateTeamspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: {
      accessMode: TeamspaceAccessMode
      description?: string | null
      name: string
      workspaceId: string
    }) =>
      apiFetch<Teamspace>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces`,
        {
          body: JSON.stringify({
            accessMode: input.accessMode,
            description: input.description ?? null,
            name: input.name,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: teamspacesQueryKey(input.workspaceId),
      })
    },
  })
}

export function useUpdateTeamspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: {
      accessMode?: TeamspaceAccessMode
      description?: string | null
      invitePolicy?: "owners" | "owners_and_members"
      memberAccessLevel?: "view" | "comment" | "edit" | "full"
      name?: string
      sidebarEditPolicy?: "owners" | "owners_and_members"
      teamspaceId: string
      workspaceId: string
    }) => {
      const { teamspaceId, workspaceId, ...body } = input
      return apiFetch<Teamspace>(
        `/workspaces/${encodeURIComponent(workspaceId)}/teamspaces/${encodeURIComponent(teamspaceId)}`,
        { body: JSON.stringify(body), method: "PATCH" },
      )
    },
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: teamspacesQueryKey(input.workspaceId),
      })
    },
  })
}

export function useUpdateTeamspaceSettings() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: {
      creationPolicy: "workspace_owners" | "workspace_members"
      workspaceId: string
    }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspace-settings`,
        { body: JSON.stringify({ creationPolicy: input.creationPolicy }), method: "PATCH" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: teamspaceSettingsQueryKey(input.workspaceId),
      })
    },
  })
}

export function useSetTeamspaceMembership() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: {
      action: "join" | "leave"
      teamspaceId: string
      workspaceId: string
    }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/${input.action}`,
        { method: "POST" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) }),
        queryClient.invalidateQueries({ queryKey: pagesQueryKey(input.workspaceId) }),
      ])
    },
  })
}

export function useAddTeamspacePrincipal() {
  return usePrincipalMutation("POST")
}

export function useUpdateTeamspacePrincipal() {
  return usePrincipalMutation("PATCH")
}

export function useRemoveTeamspacePrincipal() {
  return usePrincipalMutation("DELETE")
}

function usePrincipalMutation(method: "POST" | "PATCH" | "DELETE") {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: {
      principalId?: string
      role?: TeamspaceRole
      teamspaceId: string
      userId?: string
      workspaceId: string
    }) => {
      const suffix = input.principalId
        ? `/${encodeURIComponent(input.principalId)}`
        : ""
      return apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/teamspaces/${encodeURIComponent(input.teamspaceId)}/principals${suffix}`,
        {
          body: method === "DELETE" ? undefined : JSON.stringify({ role: input.role, userId: input.userId }),
          method,
        },
      )
    },
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: teamspacesQueryKey(input.workspaceId) }),
        queryClient.invalidateQueries({
          queryKey: teamspacePrincipalsQueryKey(input.workspaceId, input.teamspaceId),
        }),
      ])
    },
  })
}
