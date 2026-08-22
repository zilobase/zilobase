import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../context"
import { sessionQueryKey, sessionQueryOptions } from "../auth/queries"
import {
  pageRootQueryKey,
  pagesRootQueryKey,
} from "../pages/queries"
import {
  type AcceptWorkspaceInvitationResponse,
  type InvitableWorkspaceRole,
  workspaceAccessTargetsQueryKey,
  workspaceAccessTargetsQueryOptions,
  workspaceInvitationsQueryKey,
  workspaceInvitationsQueryOptions,
  workspacesQueryKey,
  workspacesQueryOptions,
  type Workspace,
  type WorkspaceMemberMutationResponse,
  type WorkspaceRole,
} from "./queries"

export function useWorkspaces() {
  const { auth } = useZilobaseFeatures()

  return useQuery(workspacesQueryOptions(auth))
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

function createSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug ? `${slug}-${Date.now().toString(36)}` : `page-${Date.now().toString(36)}`
}
