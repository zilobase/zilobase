import { queryOptions } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api"

export type GmailIntegrationStatus = {
  configured: boolean
  connected: boolean
  connectedAt?: string
  email?: string
  hostedDomain?: string
  integration: "gmail"
  needsMigration?: boolean
  providerAccountId?: string
  scopes?: string[]
  status?: string
  updatedAt?: string
}

export type GithubIntegrationStatus = {
  configured: boolean
  connected: boolean
  connectedAt?: string
  connectedUserEmail?: string | null
  connectedUserId?: number
  connectedUserLogin?: string
  connectedUserName?: string | null
  displayName?: string
  integration: "github"
  needsMigration?: boolean
  providerAccountId?: string
  scopes?: string[]
  status?: string
  updatedAt?: string
}

export type GoogleCalendarIntegrationStatus = {
  configured: boolean
  connected: boolean
  connectedAt?: string
  coworkerCalendarAccessEnabled: boolean
  coworkerCalendarAccessGranted?: boolean
  email?: string
  hostedDomain?: string
  integration: "google-calendar"
  needsMigration?: boolean
  providerAccountId?: string
  scopes?: string[]
  status?: string
  updatedAt?: string
}

export type GoogleDriveIntegrationStatus = {
  configured: boolean
  connected: boolean
  connectedAt?: string
  email?: string
  hostedDomain?: string
  integration: "google-drive"
  needsMigration?: boolean
  providerAccountId?: string
  scopes?: string[]
  status?: string
  updatedAt?: string
}

export type SlackIntegrationStatus = {
  configured: boolean
  connected: boolean
  connectedAt?: string
  displayName?: string
  enterpriseId?: string
  enterpriseName?: string
  integration: "slack"
  isEnterpriseInstall?: boolean
  needsMigration?: boolean
  providerAccountId?: string
  scopes?: string[]
  status?: string
  teamId?: string
  teamName?: string
  updatedAt?: string
}

export type LinearIntegrationStatus = {
  configured: boolean
  connected: boolean
  connectedAt?: string
  connectedUserEmail?: string
  connectedUserId?: string
  connectedUserName?: string
  displayName?: string
  integration: "linear"
  needsMigration?: boolean
  organizationId?: string
  organizationName?: string
  organizationUrlKey?: string
  providerAccountId?: string
  scopes?: string[]
  status?: string
  updatedAt?: string
}

export type IntegrationStatuses = {
  gmail: GmailIntegrationStatus | null
  github: GithubIntegrationStatus | null
  googleCalendar: GoogleCalendarIntegrationStatus | null
  googleDrive: GoogleDriveIntegrationStatus | null
  linear: LinearIntegrationStatus | null
  slack: SlackIntegrationStatus | null
}

export type AiProviderModel = {
  id: string
  name: string
}

export type AiProviderCatalogItem = {
  id: string
  name: string
  kind: "workers-ai" | "openai-compatible"
  baseUrl?: string
  models: AiProviderModel[]
  requiresApiKey: boolean
}

export type OrganizationAiProviderConfig = {
  apiKeyConfigured: boolean
  baseUrl: string
  enabled: boolean
  modelIds: string[]
  provider: AiProviderCatalogItem
  providerId: string
  updatedAt?: string
}

export type OrganizationAiProvidersResponse = {
  providers: OrganizationAiProviderConfig[]
}

export type OrganizationAiChatModel = {
  chef: string
  chefSlug: string
  gatewayId: string
  id: string
  name: string
  providers: string[]
}

export type OrganizationAiModelsResponse = {
  models: OrganizationAiChatModel[]
}

export const integrationsQueryKey = (organizationId: string | null | undefined) =>
  ["organization-integrations", organizationId ?? "none"] as const
export const aiModelsQueryKey = (organizationId: string | null | undefined) =>
  ["organization-ai-models", organizationId ?? "none"] as const
export const aiProvidersQueryKey = (organizationId: string | null | undefined) =>
  ["organization-ai-providers", organizationId ?? "none"] as const

export const integrationsQueryOptions = (
  organizationId: string | null | undefined,
) => queryOptions({
  queryKey: integrationsQueryKey(organizationId),
  enabled: Boolean(organizationId),
  queryFn: async (): Promise<IntegrationStatuses> => {
    if (!organizationId) {
      throw new Error("Select an organization before loading integrations.")
    }

    const [gmail, github, googleCalendar, googleDrive, slack, linear] =
      await Promise.all([
        apiFetch<GmailIntegrationStatus>(
          "/api/organization/settings/integrations/gmail",
          integrationRequestOptions(organizationId),
        ),
        apiFetch<GithubIntegrationStatus>(
          "/api/organization/settings/integrations/github",
          integrationRequestOptions(organizationId),
        ),
        apiFetch<GoogleCalendarIntegrationStatus>(
          "/api/organization/settings/integrations/google-calendar",
          integrationRequestOptions(organizationId),
        ),
        apiFetch<GoogleDriveIntegrationStatus>(
          "/api/organization/settings/integrations/google-drive",
          integrationRequestOptions(organizationId),
        ),
        apiFetch<SlackIntegrationStatus>(
          "/api/organization/settings/integrations/slack",
          integrationRequestOptions(organizationId),
        ),
        apiFetch<LinearIntegrationStatus>(
          "/api/organization/settings/integrations/linear",
          integrationRequestOptions(organizationId),
        ),
      ])

    return { gmail, github, googleCalendar, googleDrive, slack, linear }
  },
})

export const aiModelsQueryOptions = (
  organizationId: string | null | undefined,
) => queryOptions({
  queryKey: aiModelsQueryKey(organizationId),
  enabled: Boolean(organizationId),
  queryFn: () =>
    apiFetch<OrganizationAiModelsResponse>(
      "/api/organization/settings/ai/models",
      integrationRequestOptions(organizationId),
    ),
})

export const aiProvidersQueryOptions = (
  organizationId: string | null | undefined,
) => queryOptions({
  queryKey: aiProvidersQueryKey(organizationId),
  enabled: Boolean(organizationId),
  queryFn: () =>
    apiFetch<OrganizationAiProvidersResponse>(
      "/api/organization/settings/ai",
      integrationRequestOptions(organizationId),
    ),
})

export function integrationRequestOptions(
  organizationId: string | null | undefined,
): RequestInit {
  return organizationId
    ? { headers: { "x-notelab-organization-id": organizationId } }
    : {}
}
