import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import { useSession } from "../auth/hooks"
import { sessionQueryKey, sessionQueryOptions } from "../auth/queries"
import {
  pageRootQueryKey,
  pagesRootQueryKey,
} from "../pages/queries"
import {
  workspaceAccessTargetsQueryKey,
  workspaceAccessTargetsQueryOptions,
  workspaceInvitationsQueryKey,
  workspaceInvitationsQueryOptions,
  workspaceGuestsQueryKey,
  workspaceGuestsQueryOptions,
  workspaceGuestPolicyQueryKey,
  workspaceGuestPolicyQueryOptions,
  workspaceGuestRequestsQueryKey,
  workspaceGuestRequestsQueryOptions,
  workspacesQueryKey,
  workspacesQueryOptions,
} from "./queries"
import type { AcceptWorkspaceInvitationResponse, GuestInviteMode, InvitableWorkspaceRole, Workspace, WorkspaceMemberMutationResponse, WorkspaceRole } from "./contracts"

export function useWorkspaces() {
  const { auth } = useZilobaseFeatures()

  return useQuery(workspacesQueryOptions(auth))
}

export function useActiveWorkspaceId() {
  const { auth, preferredActiveWorkspaceId } = useZilobaseFeatures()
  const { data: sessionData } = useSession()
  const workspacesQuery = useQuery(workspacesQueryOptions(auth))

  return resolveActiveWorkspaceId({
    preferredActiveWorkspaceId,
    sessionWorkspaceId: sessionData?.session?.activeWorkspaceId ?? null,
    status: workspacesQuery.status,
    workspaces: workspacesQuery.data ?? [],
  })
}

export function resolveActiveWorkspaceId(input: {
  preferredActiveWorkspaceId: string | null | undefined
  sessionWorkspaceId: string | null | undefined
  status: "error" | "pending" | "success"
  workspaces: ReadonlyArray<Pick<Workspace, "id">>
}) {
  const {
    preferredActiveWorkspaceId,
    sessionWorkspaceId,
    status,
    workspaces,
  } = input
  const storedWorkspace = workspaces.find(
    (workspace) => workspace.id === preferredActiveWorkspaceId,
  )
  const sessionWorkspace = workspaces.find(
    (workspace) => workspace.id === sessionWorkspaceId,
  )

  const validatedWorkspaceId =
    storedWorkspace?.id ??
    sessionWorkspace?.id ??
    workspaces[0]?.id

  if (validatedWorkspaceId) return validatedWorkspaceId

  // Do not start workspace-scoped queries or realtime connections with an ID
  // that has not yet been checked against the user's current workspace list.
  // If that list is unavailable, retain the previous fallback so the rest of
  // the application can continue operating in a degraded network state.
  return unavailableWorkspaceFallback(status, sessionWorkspaceId, preferredActiveWorkspaceId)
}

function unavailableWorkspaceFallback(
  status: "error" | "pending" | "success",
  sessionWorkspaceId: string | null | undefined,
  preferredActiveWorkspaceId: string | null | undefined,
) {
  return status === "error"
    ? sessionWorkspaceId ?? preferredActiveWorkspaceId ?? null
    : null
}

export function useWorkspaceAccessTargets(
  workspaceId: string | null | undefined,
) {
  const { apiFetch } = useZilobaseFeatures()

  return useQuery(workspaceAccessTargetsQueryOptions(apiFetch, workspaceId))
}

export function useWorkspaceInvitations(
  workspaceId: string | null | undefined,
) {
  const { auth } = useZilobaseFeatures()

  return useQuery(workspaceInvitationsQueryOptions(auth, workspaceId))
}

export function useWorkspaceGuests(
  workspaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery({
    ...workspaceGuestsQueryOptions(apiFetch, workspaceId),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  })
}

export function useWorkspaceGuestPolicy(
  workspaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery({
    ...workspaceGuestPolicyQueryOptions(apiFetch, workspaceId),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  })
}

export function useWorkspaceGuestRequests(
  workspaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures()
  return useQuery({
    ...workspaceGuestRequestsQueryOptions(apiFetch, workspaceId),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  })
}

export function useUpdateWorkspaceGuestPolicy() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: { mode: GuestInviteMode; workspaceId: string }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/guest-policy`,
        {
          body: JSON.stringify({ mode: input.mode }),
          method: "PATCH",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceGuestPolicyQueryKey(input.workspaceId),
      })
    },
  })
}

export function useReviewWorkspaceGuestRequest() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: {
      action: "approve" | "reject"
      requestId: string
      workspaceId: string
    }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/guest-requests/${encodeURIComponent(input.requestId)}/${input.action}`,
        { method: "POST" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceGuestRequestsQueryKey(input.workspaceId),
      })
    },
  })
}

export function usePromoteWorkspaceGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  return useMutation({
    mutationFn: (input: { userId: string; workspaceId: string }) =>
      apiFetch(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/guests/${encodeURIComponent(input.userId)}/promote`,
        { method: "POST" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceGuestsQueryKey(input.workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
        }),
      ])
    },
  })
}

export function useRevokeWorkspaceGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: { userId: string; workspaceId: string }) =>
      apiFetch<{ guest: unknown }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/guests/${encodeURIComponent(input.userId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceGuestsQueryKey(input.workspaceId),
      })
    },
  })
}

export function useCreateWorkspace() {
  const {
    auth,
    queryClient,
    setPreferredActiveWorkspaceId,
  } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (name: string) =>
      auth.createWorkspace<Workspace>({
        name,
        slug: createSlug(name),
      }),
    onSuccess: async (workspace) => {
      setPreferredActiveWorkspaceId?.(workspace.id)
      await auth.setActiveWorkspace(workspace.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
        queryClient.fetchQuery({
          ...sessionQueryOptions(auth),
          staleTime: 0,
        }),
      ])
    },
  })
}

export function useInviteWorkspaceMember() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: {
      accessExpiresAt?: string | null
      email: string
      workspaceId: string
      role: InvitableWorkspaceRole
    }) =>
      apiFetch<{ invitation: unknown }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/member-invitations`,
        {
          body: JSON.stringify({
            accessExpiresAt: input.accessExpiresAt ?? null,
            email: input.email,
            role: input.role,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceInvitationsQueryKey(input.workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
        }),
      ])
    },
  })
}

export function useUpdateWorkspaceMember() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: {
      accessExpiresAt?: string | null
      memberId: string
      role: WorkspaceRole
      workspaceId: string
    }) =>
      apiFetch<WorkspaceMemberMutationResponse>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`,
        {
          body: JSON.stringify({
            accessExpiresAt: input.accessExpiresAt ?? null,
            role: input.role,
          }),
          method: "PATCH",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
      })
    },
  })
}

export function useRemoveWorkspaceMember() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: { memberId: string; workspaceId: string }) =>
      apiFetch<{ removed: boolean }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.memberId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceAccessTargetsQueryKey(input.workspaceId),
        }),
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
      ])
    },
  })
}

export function useAcceptWorkspaceInvitation() {
  const {
    auth,
    queryClient,
    setPreferredActiveWorkspaceId,
  } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (invitationId: string) =>
      auth.acceptWorkspaceInvitation<AcceptWorkspaceInvitationResponse>({
        invitationId,
      }),
    onSuccess: async (result) => {
      setPreferredActiveWorkspaceId?.(result.invitation.workspaceId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesQueryKey }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
      ])
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      })
    },
  })
}

export function useSetActiveWorkspace() {
  const {
    auth,
    queryClient,
    setPreferredActiveWorkspaceId,
  } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (workspaceId: string) => auth.setActiveWorkspace(workspaceId),
    onSuccess: async (_result, workspaceId) => {
      setPreferredActiveWorkspaceId?.(workspaceId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
        queryClient.invalidateQueries({ queryKey: pageRootQueryKey() }),
        queryClient.invalidateQueries({ queryKey: pagesRootQueryKey() }),
      ])
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      })
    },
  })
}

export function useUpdateWorkspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: ({
      workspaceId,
      ...input
    }: {
      workspaceId: string
      logo?: string | null
      metadata?: string | null
      name?: string
      slug?: string
    }) =>
      apiFetch<Workspace>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (updatedWorkspace) => {
      queryClient.setQueryData<Workspace[]>(
        workspacesQueryKey,
        (current = []) => {
          const hasMatch = current.some(
            (workspace) => workspace.id === updatedWorkspace.id,
          )

          if (!hasMatch) {
            return [...current, updatedWorkspace]
          }

          return current.map((workspace) =>
            workspace.id === updatedWorkspace.id
              ? updatedWorkspace
              : workspace,
          )
        },
      )
    },
  })
}

export function useDeleteWorkspace() {
  const {
    apiFetch,
    auth,
    queryClient,
    setPreferredActiveWorkspaceId,
  } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: { confirmationName: string; workspaceId: string }) =>
      apiFetch<{ deleted: boolean; workspaceId: string }>(
        `/workspaces/${encodeURIComponent(input.workspaceId)}`,
        {
          body: JSON.stringify({ confirmationName: input.confirmationName }),
          method: "DELETE",
        },
      ),
    onSuccess: async (_result, input) => {
      const remaining = (
        queryClient.getQueryData<Workspace[]>(workspacesQueryKey) ?? []
      ).filter((workspace) => workspace.id !== input.workspaceId)
      const nextWorkspace = remaining[0] ?? null

      queryClient.setQueryData(workspacesQueryKey, remaining)
      setPreferredActiveWorkspaceId?.(nextWorkspace?.id ?? null)

      if (nextWorkspace) {
        await auth.setActiveWorkspace(nextWorkspace.id)
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
        queryClient.invalidateQueries({ queryKey: pageRootQueryKey() }),
        queryClient.invalidateQueries({ queryKey: pagesRootQueryKey() }),
      ])
    },
  })
}

function createSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug ? `${slug}-${Date.now().toString(36)}` : `page-${Date.now().toString(36)}`
}
