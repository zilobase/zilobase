import type { Workspace, WorkspaceAccessTargetsPayload, WorkspaceInvitation, WorkspaceGuest, WorkspaceGuestPolicy, WorkspaceGuestRequest } from "./contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher, ZilobaseAuthClient } from "../shared/context"

export const workspaceGuestsQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace", workspaceId ?? "none", "guests"] as const

export const workspaceGuestPolicyQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace", workspaceId ?? "none", "guest-policy"] as const

export const workspaceGuestRequestsQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspace", workspaceId ?? "none", "guest-requests"] as const

export const workspaceGuestsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceGuestsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) return []
      const result = await apiFetch<{ guests: WorkspaceGuest[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/guests`,
        { method: "GET", signal },
      )
      return result.guests
    },
  })

export const workspaceGuestPolicyQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceGuestPolicyQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) return null
      const result = await apiFetch<{ policy: WorkspaceGuestPolicy }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/guest-policy`,
        { method: "GET", signal },
      )
      return result.policy
    },
  })

export const workspaceGuestRequestsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceGuestRequestsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) return []
      const result = await apiFetch<{ requests: WorkspaceGuestRequest[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/guest-requests`,
        { method: "GET", signal },
      )
      return result.requests
    },
  })

export const workspacesQueryKey = ["workspaces"] as const
export const workspaceAccessTargetsQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspaces", workspaceId ?? "none", "access-targets"] as const
export const workspaceInvitationsQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspaces", workspaceId ?? "none", "invitations"] as const

export const workspacesQueryOptions = (auth: ZilobaseAuthClient) =>
  queryOptions({
    queryKey: workspacesQueryKey,
    queryFn: async () => {
      try {
        const workspaces = await auth.listWorkspaces<Workspace | null>()

        return workspaces.filter(isWorkspace)
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return []
        }

        throw error
      }
    },
  })

function isWorkspace(value: Workspace | null): value is Workspace {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.slug === "string",
  )
}

export function workspaceRequestOptions(
  workspaceId: string | null | undefined,
  init?: RequestInit,
): RequestInit {
  if (!workspaceId) {
    return init ?? {}
  }

  const headers = new Headers(init?.headers)
  headers.set("x-zilobase-workspace-id", workspaceId)

  return { ...init, headers }
}

export const workspaceAccessTargetsQueryOptions = (
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceAccessTargetsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) {
        return { members: [], teams: [] }
      }

      return apiFetch<WorkspaceAccessTargetsPayload>(
        `/workspaces/${workspaceId}/access-targets`,
        { method: "GET", signal },
      )
    },
  })

export const workspaceInvitationsQueryOptions = (
  auth: ZilobaseAuthClient,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: workspaceInvitationsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) {
        return []
      }

      return auth.listWorkspaceInvitations<WorkspaceInvitation>(workspaceId)
    },
  })
