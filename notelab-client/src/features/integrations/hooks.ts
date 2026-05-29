import { useMutation, useQuery } from "@tanstack/react-query"

import { useSession } from "@/features/auth/hooks"
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
  type GoogleCalendarIntegrationStatus,
  type OrganizationAiProvidersResponse,
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
    mutationFn: (id: IntegrationEndpoint) =>
      apiFetch<{ connected: false; deleted: boolean }>(
        `/api/organization/settings/integrations/${id}/disconnect`,
        {
          ...integrationRequestOptions(organizationId),
          method: "POST",
          body: JSON.stringify({}),
        },
      ),
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
    mutationFn: (input: { coworkerCalendarAccessEnabled: boolean }) =>
      apiFetch<GoogleCalendarIntegrationStatus>(
        "/api/organization/settings/integrations/google-calendar",
        {
          ...integrationRequestOptions(organizationId),
          method: "PATCH",
          body: JSON.stringify(input),
        },
      ),
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
  const storedActiveOrganizationId = useAppStore(
    (state) => state.activeOrganizationId,
  )

  return sessionData?.session?.activeOrganizationId ?? storedActiveOrganizationId
}
