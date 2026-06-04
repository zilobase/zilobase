import { useMutation, useQuery } from "@tanstack/react-query"

import { useSession } from "@/features/auth/hooks"
import { organizationsQueryOptions } from "@/features/organizations/queries"
import { apiFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
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
  type OrganizationAiProvidersResponse,
  type SlackIntegrationStatus,
} from "@/features/integrations/queries"
import { useAppStore } from "@/stores/app-store"

type OAuthStart = {
  url: string
}

export function useIntegrations() {
  return useQuery(integrationsQueryOptions(useActiveOrganizationId()))
}

export function useOrganizationAiModels() {
  return useQuery(aiModelsQueryOptions(useActiveOrganizationId()))
}

export function useOrganizationAiProviders() {
  return useQuery(aiProvidersQueryOptions(useActiveOrganizationId()))
}

export function useStartIntegrationOAuth() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: IntegrationEndpoint
      input?: unknown
    }) =>
      apiFetch<OAuthStart>(
        `/api/organization/settings/integrations/${id}/start`,
        {
          ...integrationRequestOptions(organizationId),
          method: "POST",
          body: JSON.stringify(input ?? {}),
        },
      ),
  })
}

export function useDisconnectIntegration() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: (
      input:
        | IntegrationEndpoint
        | { id: IntegrationEndpoint; mode?: "personal" | "workspace" },
    ) => {
      const id = typeof input === "string" ? input : input.id
      const body =
        typeof input === "string" ? {} : { mode: input.mode ?? "workspace" }

      return apiFetch<{ connected: false; deleted: boolean }>(
        `/api/organization/settings/integrations/${id}/disconnect`,
        {
          ...integrationRequestOptions(organizationId),
          method: "POST",
          body: JSON.stringify(body),
        },
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(organizationId),
      })
    },
  })
}

export function useUpdateLinearIntegrationSettings() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: LinearIntegrationStatus
      }>("/api/organization/settings/integrations/linear/settings", {
        ...integrationRequestOptions(organizationId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(organizationId),
      })
    },
  })
}

export function useUpdateSlackIntegrationSettings() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: SlackIntegrationStatus
      }>("/api/organization/settings/integrations/slack/settings", {
        ...integrationRequestOptions(organizationId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(organizationId),
      })
    },
  })
}

export function useUpdateGithubIntegrationSettings() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GithubIntegrationStatus
      }>("/api/organization/settings/integrations/github/settings", {
        ...integrationRequestOptions(organizationId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(organizationId),
      })
    },
  })
}

export function useUpdateGmailIntegrationSettings() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GmailIntegrationStatus
      }>("/api/organization/settings/integrations/gmail/settings", {
        ...integrationRequestOptions(organizationId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(organizationId),
      })
    },
  })
}

export function useUpdateGoogleDriveIntegrationSettings() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: (input: { enforceEmailMatch: boolean }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GoogleDriveIntegrationStatus
      }>("/api/organization/settings/integrations/google-drive/settings", {
        ...integrationRequestOptions(organizationId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(organizationId),
      })
    },
  })
}

export function useUpdateGoogleCalendarIntegrationSettings() {
  const organizationId = useActiveOrganizationId()

  return useMutation({
    mutationFn: (input: {
      coworkerCalendarAccessEnabled?: boolean
      enforceEmailMatch?: boolean
    }) =>
      apiFetch<{
        removedPersonalConnections: number
        status: GoogleCalendarIntegrationStatus
      }>("/api/organization/settings/integrations/google-calendar/settings", {
        ...integrationRequestOptions(organizationId),
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(organizationId),
      })
    },
  })
}

export function useUpdateOrganizationAiProvider() {
  const organizationId = useActiveOrganizationId()

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
      apiFetch<OrganizationAiProvidersResponse>(
        `/api/organization/settings/ai/providers/${encodeURIComponent(providerId)}`,
        {
          ...integrationRequestOptions(organizationId),
          method: "PUT",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiProvidersQueryKey(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: aiModelsQueryKey(organizationId),
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

export function useActiveOrganizationId() {
  const { data: sessionData } = useSession()
  const { data: organizations = [] } = useQuery(organizationsQueryOptions)
  const storedActiveOrganizationId = useAppStore(
    (state) => state.activeOrganizationId,
  )
  const sessionOrganizationId = sessionData?.session?.activeOrganizationId ?? null
  const storedOrganization = organizations.find(
    (organization) => organization.id === storedActiveOrganizationId,
  )
  const sessionOrganization = organizations.find(
    (organization) => organization.id === sessionOrganizationId,
  )

  return (
    storedOrganization?.id ??
    sessionOrganization?.id ??
    organizations[0]?.id ??
    sessionOrganizationId ??
    storedActiveOrganizationId
  )
}
