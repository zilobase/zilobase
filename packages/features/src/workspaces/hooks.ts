import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import { sessionQueryKey, sessionQueryOptions } from "../auth/queries"
import {
  pageRootQueryKey,
  pagesRootQueryKey,
} from "../pages/queries"
import {
  type AcceptWorkspaceInvitationResponse,
  workspaceAccessTargetsQueryKey,
  workspaceAccessTargetsQueryOptions,
  workspaceInvitationsQueryKey,
  workspaceInvitationsQueryOptions,
  workspacesQueryKey,
  workspacesQueryOptions,
  type Workspace,
  type WorkspaceRole,
} from "./queries"

export function useWorkspaces() {
  const { auth } = useNotelabFeatures()

  return useQuery(workspacesQueryOptions(auth))
}

export function useWorkspaceAccessTargets(
  workspaceId: string | null | undefined,
) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(workspaceAccessTargetsQueryOptions(apiFetch, workspaceId))
}

export function useWorkspaceInvitations(
  workspaceId: string | null | undefined,
) {
  const { auth } = useNotelabFeatures()

  return useQuery(workspaceInvitationsQueryOptions(auth, workspaceId))
}

export function useCreateWorkspace() {
  const {
    auth,
    queryClient,
    setPreferredActiveWorkspaceId,
  } = useNotelabFeatures()

  return useMutation({
    mutationFn: (name: string) =>
      auth.createWorkspace<Workspace>({
        name,
        slug: createSlug(name),
      }),
    onSuccess: async (workspace) => {
      setPreferredActiveWorkspaceId?.(workspace.id)
      await auth.setActiveWorkspace(workspace.id)
      await queryClient.invalidateQueries({ queryKey: workspacesQueryKey })
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await queryClient.fetchQuery({
        ...sessionQueryOptions(auth),
        staleTime: 0,
      })
    },
  })
}

export function useInviteWorkspaceMember() {
  const { auth, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: {
      email: string
      workspaceId: string
      role: WorkspaceRole
    }) =>
      auth.inviteWorkspaceMember(input),
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

export function useAcceptWorkspaceInvitation() {
  const {
    auth,
    queryClient,
    setPreferredActiveWorkspaceId,
  } = useNotelabFeatures()

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
  } = useNotelabFeatures()

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
  const { apiFetch, queryClient } = useNotelabFeatures()

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
