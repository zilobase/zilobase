import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import { useSession } from "../auth/hooks"
import { workspacesQueryOptions } from "../workspaces/queries"
import {
  aiModelsQueryKey,
  aiModelsQueryOptions,
  aiProvidersQueryOptions,
  aiProvidersQueryKey,
  integrationRequestOptions,
  integrationsQueryOptions,
  integrationsQueryKey,
  type GmailIntegrationStatus,
  type GoogleCalendarIntegrationStatus,
  type GoogleDriveIntegrationStatus,
  type GithubIntegrationStatus,
  type LinearIntegrationStatus,
  type WorkspaceAiProvidersResponse,
  type SlackIntegrationStatus,
} from "./queries"

type OAuthStart = {
  url: string
}

export function useIntegrations() {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(integrationsQueryOptions(apiFetch, useActiveWorkspaceId()))
}

export function useWorkspaceAiModels() {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(aiModelsQueryOptions(apiFetch, useActiveWorkspaceId()))
}

export function useWorkspaceAiProviders() {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(aiProvidersQueryOptions(apiFetch, useActiveWorkspaceId()))
}

export function useStartIntegrationOAuth() {
  const { apiFetch } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: IntegrationEndpoint
      input?: unknown
    }) =>
      apiFetch<OAuthStart>(
        `/api/workspace/settings/integrations/${id}/start`,
        {
          ...integrationRequestOptions(workspaceId),
          method: "POST",
          body: JSON.stringify(input ?? {}),
        },
      ),
  })
}

export function useDisconnectIntegration() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: (
      input:
        | IntegrationEndpoint
        | { id: IntegrationEndpoint; mode?: "personal" | "page" },
    ) => {
      const id = typeof input === "string" ? input : input.id
      const body =
        typeof input === "string" ? {} : { mode: input.mode ?? "page" }

      return apiFetch<{ connected: false; deleted: boolean }>(
        `/api/workspace/settings/integrations/${id}/disconnect`,
        {
          ...integrationRequestOptions(workspaceId),
          method: "POST",
          body: JSON.stringify(body),
        },
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(workspaceId),
      })
    },
  })
}

export function useUpdateLinearIntegrationSettings() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: LinearIntegrationStatus
      }>("/api/workspace/settings/integrations/linear/settings", {
        ...integrationRequestOptions(workspaceId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(workspaceId),
      })
    },
  })
}

export function useUpdateSlackIntegrationSettings() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: SlackIntegrationStatus
      }>("/api/workspace/settings/integrations/slack/settings", {
        ...integrationRequestOptions(workspaceId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(workspaceId),
      })
    },
  })
}

export function useUpdateGithubIntegrationSettings() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GithubIntegrationStatus
      }>("/api/workspace/settings/integrations/github/settings", {
        ...integrationRequestOptions(workspaceId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(workspaceId),
      })
    },
  })
}

export function useUpdateGmailIntegrationSettings() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GmailIntegrationStatus
      }>("/api/workspace/settings/integrations/gmail/settings", {
        ...integrationRequestOptions(workspaceId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(workspaceId),
      })
    },
  })
}

export function useUpdateGoogleDriveIntegrationSettings() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GoogleDriveIntegrationStatus
      }>("/api/workspace/settings/integrations/google-drive/settings", {
        ...integrationRequestOptions(workspaceId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(workspaceId),
      })
    },
  })
}

export function useUpdateGoogleCalendarIntegrationSettings() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: (input: {
      coworkerCalendarAccessEnabled?: boolean
      enforceEmailMatch?: boolean
    }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GoogleCalendarIntegrationStatus
      }>("/api/workspace/settings/integrations/google-calendar/settings", {
        ...integrationRequestOptions(workspaceId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(workspaceId),
      })
    },
  })
}

export function useUpdateWorkspaceAiProvider() {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const workspaceId = useActiveWorkspaceId()

  return useMutation({
    mutationFn: ({
      input,
      providerId,
    }: {
      providerId: string
      input: {
        apiKey?: string
        baseUrl?: string
        enabled: boolean
        modelIds?: string[]
      }
    }) =>
      apiFetch<WorkspaceAiProvidersResponse>(
        `/api/workspace/settings/ai/providers/${encodeURIComponent(providerId)}`,
        {
          ...integrationRequestOptions(workspaceId),
          method: "PUT",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiProvidersQueryKey(workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: aiModelsQueryKey(workspaceId),
        }),
      ])
    },
  })
}

export type IntegrationEndpoint =
  | "gmail"
  | "github"
  | "google-calendar"
  | "google-drive"
  | "linear"
  | "slack"

export function useActiveWorkspaceId() {
  const { auth, preferredActiveWorkspaceId } = useNotelabFeatures()
  const { data: sessionData } = useSession()
  const { data: workspaces = [] } = useQuery(workspacesQueryOptions(auth))
  const sessionWorkspaceId = sessionData?.session?.activeWorkspaceId ?? null
  const storedWorkspace = workspaces.find(
    (workspace) => workspace.id === preferredActiveWorkspaceId,
  )
  const sessionWorkspace = workspaces.find(
    (workspace) => workspace.id === sessionWorkspaceId,
  )

  return (
    storedWorkspace?.id ??
    sessionWorkspace?.id ??
    workspaces[0]?.id ??
    sessionWorkspaceId ??
    preferredActiveWorkspaceId
  )
}
