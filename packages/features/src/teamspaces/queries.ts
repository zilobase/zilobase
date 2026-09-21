import type { Teamspace, TeamspacePrincipal, TeamspaceWorkspaceSettings } from "./contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/api-fetcher"

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

export const archivedTeamspacesQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace", workspaceId ?? "none", "teamspaces", "archived"] as const

export const archivedTeamspacesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    enabled: Boolean(workspaceId),
    queryKey: archivedTeamspacesQueryKey(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) return []
      const result = await apiFetch<{ teamspaces: Teamspace[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/teamspaces?status=archived`,
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
