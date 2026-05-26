import { queryOptions } from "@tanstack/react-query"

import { ApiError, apiFetch } from "@/lib/api"

export type Organization = {
  id: string
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
}

export type OrganizationRole = "admin" | "member"

export type OrganizationMember = {
  email: string
  id: string
  memberId: string
  name: string
  role: string
}

export type OrganizationTeam = {
  id: string
  name: string
}

export type OrganizationAccessTargetsPayload = {
  members: OrganizationMember[]
  teams: OrganizationTeam[]
}

export type OrganizationInvitation = {
  id: string
  organizationId: string
  email: string
  role: OrganizationRole | string
  status: string
  inviterId: string
  expiresAt: string
  createdAt: string
  teamId?: string
}

export type AcceptOrganizationInvitationResponse = {
  invitation: OrganizationInvitation
  member: {
    id: string
    organizationId: string
    userId: string
    role: string
    createdAt: string
  }
}

export const organizationsQueryKey = ["organizations"] as const
export const organizationAccessTargetsQueryKey = (
  organizationId: string | null | undefined,
) => ["organization-access-targets", organizationId ?? "none"] as const
export const organizationInvitationsQueryKey = (
  organizationId: string | null | undefined,
) => ["organization-invitations", organizationId ?? "none"] as const

export const organizationsQueryOptions = queryOptions({
  queryKey: organizationsQueryKey,
  queryFn: async () => {
    try {
      return await apiFetch<Organization[]>("/api/auth/organization/list", {
        method: "GET",
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return []
      }

      throw error
    }
  },
})

export const organizationAccessTargetsQueryOptions = (
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: organizationAccessTargetsQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return { members: [], teams: [] }
      }

      return apiFetch<OrganizationAccessTargetsPayload>(
        `/organizations/${organizationId}/access-targets`,
        { method: "GET" },
      )
    },
  })

export const organizationInvitationsQueryOptions = (
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: organizationInvitationsQueryKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        return []
      }

      return apiFetch<OrganizationInvitation[]>(
        `/api/auth/organization/list-invitations?organizationId=${encodeURIComponent(organizationId)}`,
        { method: "GET" },
      )
    },
  })
