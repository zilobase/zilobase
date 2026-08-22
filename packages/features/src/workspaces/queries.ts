import { queryOptions } from "@tanstack/react-query"

import type { ZilobaseAuthClient } from "../context"

export type Workspace = {
  id: string
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
}

export type WorkspaceRole = "owner" | "admin" | "member" | "temporary"
export type InvitableWorkspaceRole = Exclude<WorkspaceRole, "owner">

export type WorkspaceMember = {
  email: string
  id: string
  memberId: string
  name: string
  role: WorkspaceRole | string
  accessExpiresAt?: string | null
}

export type WorkspaceTeam = {
  id: string
  name: string
}

export type WorkspaceAccessTargetsPayload = {
  members: WorkspaceMember[]
  teams: WorkspaceTeam[]
}

export type WorkspaceInvitation = {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole | string
  status: string
  inviterId: string
  expiresAt: string
  membershipExpiresAt?: string | null
  createdAt: string
  teamId?: string
}

export type WorkspaceMemberMutationResponse = {
  member: {
    accessExpiresAt?: string | null
    createdAt: string
    id: string
    role: WorkspaceRole | string
    userId: string
    workspaceId?: string
  }
}

export type AcceptWorkspaceInvitationResponse = {
  invitation: WorkspaceInvitation
  member: {
    id: string
    workspaceId: string
    userId: string
    role: string
    createdAt: string
  }
}

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
