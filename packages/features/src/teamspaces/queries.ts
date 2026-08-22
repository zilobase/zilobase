import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type TeamspaceAccessMode = "open" | "closed" | "private"
export type TeamspaceRole = "owner" | "member"
export type Teamspace = {
  id: string
  workspaceId: string
  name: string
  description: string | null
  icon: unknown
  accessMode: TeamspaceAccessMode
  memberAccessLevel: "view" | "comment" | "edit" | "full"
  invitePolicy: "owners" | "owners_and_members"
  sidebarEditPolicy: "owners" | "owners_and_members"
  isDefault: boolean
  archivedAt: string | null
  currentUserRole: TeamspaceRole | null
  memberCount?: number
  ownerIds?: string[]
  createdAt: string
  updatedAt: string
}

export type TeamspacePrincipal = {
  id: string
  principalId: string
  principalType: "user" | "team"
  role: TeamspaceRole
  membershipSource: string
  accessLevelOverride: "view" | "comment" | "edit" | "full" | null
  name: string | null
  email: string | null
  createdAt: string
}

export type TeamspaceWorkspaceSettings = {
  canManage: boolean
  creationPolicy: "workspace_owners" | "workspace_members"
}

export const teamspacesQueryKey = (workspaceId: string | null | undefined) =>
  ["workspace", workspaceId ?? "none", "teamspaces"] as const

export const teamspaceSettingsQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace", workspaceId ?? "none", "teamspace-settings"] as const

export const teamspacePrincipalsQueryKey = (
  workspaceId: string,
  teamspaceId: string,
) => ["workspace", workspaceId, "teamspaces", teamspaceId, "principals"] as const

export const teamspacesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    enabled: Boolean(workspaceId),
    queryKey: teamspacesQueryKey(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) return []
      const result = await apiFetch<{ teamspaces: Teamspace[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/teamspaces`,
        { signal },
      )
      return result.teamspaces
    },
  })

export const teamspaceSettingsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    enabled: Boolean(workspaceId),
    queryKey: teamspaceSettingsQueryKey(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) return null
      return apiFetch<TeamspaceWorkspaceSettings>(
        `/workspaces/${encodeURIComponent(workspaceId)}/teamspace-settings`,
        { signal },
      )
    },
  })

export const teamspacePrincipalsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  teamspaceId: string | null | undefined,
) =>
  queryOptions({
    enabled: Boolean(workspaceId && teamspaceId),
    queryKey: teamspacePrincipalsQueryKey(
      workspaceId ?? "none",
      teamspaceId ?? "none",
    ),
    queryFn: async ({ signal }) => {
      if (!workspaceId || !teamspaceId) return []
      const result = await apiFetch<{ principals: TeamspacePrincipal[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/teamspaces/${encodeURIComponent(teamspaceId)}/principals`,
        { signal },
      )
      return result.principals
    },
  })
