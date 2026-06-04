import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import { sessionQueryKey, sessionQueryOptions } from "../auth/queries"
import {
  type AcceptOrganizationInvitationResponse,
  organizationAccessTargetsQueryKey,
  organizationAccessTargetsQueryOptions,
  organizationInvitationsQueryKey,
  organizationInvitationsQueryOptions,
  organizationsQueryKey,
  organizationsQueryOptions,
  type Organization,
  type OrganizationRole,
} from "./queries"

export function useOrganizations() {
  const { auth } = useNotelabFeatures()

  return useQuery(organizationsQueryOptions(auth))
}

export function useOrganizationAccessTargets(
  organizationId: string | null | undefined,
) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(organizationAccessTargetsQueryOptions(apiFetch, organizationId))
}

export function useOrganizationInvitations(
  organizationId: string | null | undefined,
) {
  const { auth } = useNotelabFeatures()

  return useQuery(organizationInvitationsQueryOptions(auth, organizationId))
}

export function useCreateOrganization() {
  const {
    auth,
    queryClient,
    setPreferredActiveOrganizationId,
  } = useNotelabFeatures()

  return useMutation({
    mutationFn: (name: string) =>
      auth.createOrganization<Organization>({
        name,
        slug: createSlug(name),
      }),
    onSuccess: async (organization) => {
      setPreferredActiveOrganizationId?.(organization.id)
      await auth.setActiveOrganization(organization.id)
      await queryClient.invalidateQueries({ queryKey: organizationsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      })
    },
  })
}

export function useInviteOrganizationMember() {
  const { auth, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: {
      email: string
      organizationId: string
      role: OrganizationRole
    }) =>
      auth.inviteOrganizationMember(input),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: organizationInvitationsQueryKey(input.organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: organizationAccessTargetsQueryKey(input.organizationId),
        }),
      ])
    },
  })
}

export function useAcceptOrganizationInvitation() {
  const {
    auth,
    queryClient,
    setPreferredActiveOrganizationId,
  } = useNotelabFeatures()

  return useMutation({
    mutationFn: (invitationId: string) =>
      auth.acceptOrganizationInvitation<AcceptOrganizationInvitationResponse>({
        invitationId,
      }),
    onSuccess: async (result) => {
      setPreferredActiveOrganizationId?.(result.invitation.organizationId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationsQueryKey }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
      ])
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      })
    },
  })
}

export function useSetActiveOrganization() {
  const {
    auth,
    queryClient,
    setPreferredActiveOrganizationId,
  } = useNotelabFeatures()

  return useMutation({
    mutationFn: (organizationId: string) => auth.setActiveOrganization(organizationId),
    onSuccess: async (_result, organizationId) => {
      setPreferredActiveOrganizationId?.(organizationId)
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      })
    },
  })
}

function createSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug ? `${slug}-${Date.now().toString(36)}` : `workspace-${Date.now().toString(36)}`
}
