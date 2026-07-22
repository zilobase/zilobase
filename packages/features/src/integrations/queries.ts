import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type GmailIntegrationStatus = {
  configured: boolean
  connected: boolean
  integration: "gmail"
  needsMigration?: boolean
  personal: {
    connected: boolean
    connectedAt?: string
    email?: string
    hostedDomain?: string
    providerAccountId?: string
    providerWorkspaceId?: string
    updatedAt?: string
  }
  page: {
    connected: boolean
    connectedAt?: string
    email?: string
    enforceEmailMatch: boolean
    hostedDomain?: string
    providerAccountId?: string
    updatedAt?: string
  }
}

export type GithubIntegrationStatus = {
  configured: boolean
  connected: boolean
  integration: "github"
  needsMigration?: boolean
  personal: {
    connected: boolean
    connectedAt?: string
    email?: string
    login?: string
    name?: string
    providerAccountId?: string
    providerWorkspaceId?: string
    updatedAt?: string
  }
  page: {
    connected: boolean
    connectedAt?: string
    enforceEmailMatch: boolean
    workspaceId?: string
    workspaceLogin?: string
    workspaceName?: string
    updatedAt?: string
  }
}

export type GoogleCalendarIntegrationStatus = {
  configured: boolean
  connected: boolean
  integration: "google-calendar"
  needsMigration?: boolean
  personal: {
    connected: boolean
    connectedAt?: string
    email?: string
    hostedDomain?: string
    providerAccountId?: string
    providerWorkspaceId?: string
    updatedAt?: string
  }
  page: {
    connected: boolean
    connectedAt?: string
    coworkerCalendarAccessEnabled: boolean
    coworkerCalendarAccessGranted: boolean
    email?: string
    enforceEmailMatch: boolean
    hostedDomain?: string
    providerAccountId?: string
    updatedAt?: string
  }
}

export type GoogleDriveIntegrationStatus = {
  configured: boolean
  connected: boolean
  integration: "google-drive"
  needsMigration?: boolean
  personal: {
    connected: boolean
    connectedAt?: string
    email?: string
    hostedDomain?: string
    providerAccountId?: string
    providerWorkspaceId?: string
    updatedAt?: string
  }
  page: {
    connected: boolean
    connectedAt?: string
    email?: string
    enforceEmailMatch: boolean
    hostedDomain?: string
    providerAccountId?: string
    updatedAt?: string
  }
}

export type SlackIntegrationStatus = {
  configured: boolean
  connected: boolean
  integration: "slack"
  needsMigration?: boolean
  personal: {
    connected: boolean
    connectedAt?: string
    email?: string
    name?: string
    providerAccountId?: string
    providerWorkspaceId?: string
    updatedAt?: string
  }
  page: {
    connected: boolean
    connectedAt?: string
    enforceEmailMatch: boolean
    enterpriseId?: string
    enterpriseName?: string
    isEnterpriseInstall?: boolean
    workspaceId?: string
    workspaceName?: string
    teamId?: string
    teamName?: string
    updatedAt?: string
  }
}

export type LinearIntegrationStatus = {
  configured: boolean
  connected: boolean
  integration: "linear"
  needsMigration?: boolean
  personal: {
    connected: boolean
    connectedAt?: string
    email?: string
    name?: string
    providerAccountId?: string
    providerWorkspaceId?: string
    updatedAt?: string
  }
  page: {
    connected: boolean
    connectedAt?: string
    enforceEmailMatch: boolean
    workspaceId?: string
    workspaceName?: string
    workspaceUrlKey?: string
    updatedAt?: string
  }
}

export type IntegrationStatuses = {
  accounts: ToolkitConnectedAccount[]
  configured: boolean
  connectors: ToolkitConnector[]
}

export type ToolkitConnector = {
  authMethods: string[]
  description: string
  id: string
  logoUrl?: string
  name: string
}

export type ToolkitConnectedAccount = {
  connectorId: string
  createdAt: string
  id: string
  isDefault: boolean
  status: "active" | "expired" | "revoked"
  updatedAt: string
  userId: string
}

export type AiProviderModel = {
  id: string
  name: string
}

export type AiProviderCatalogItem = {
  id: string
  name: string
  kind: "openai"
  baseUrl?: string
  models: AiProviderModel[]
  requiresApiKey: boolean
}

export type WorkspaceAiProviderConfig = {
  apiKeyConfigured: boolean
  baseUrl: string
  enabled: boolean
  modelIds: string[]
  provider: AiProviderCatalogItem
  providerId: string
  updatedAt?: string
}

export type WorkspaceAiProvidersResponse = {
  providers: WorkspaceAiProviderConfig[]
}

export type WorkspaceAiChatModel = {
  chef: string
  chefSlug: string
  gatewayId: string
  id: string
  name: string
  providers: string[]
}

export type WorkspaceAiModelsResponse = {
  models: WorkspaceAiChatModel[]
}

export const integrationsQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "integrations"] as const
export const aiModelsQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "ai-models"] as const
export const aiProvidersQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "ai-providers"] as const

export const integrationsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) => queryOptions({
  queryKey: integrationsQueryKey(workspaceId),
  enabled: Boolean(workspaceId),
  queryFn: async ({ signal }): Promise<IntegrationStatuses> => {
    if (!workspaceId) {
      throw new Error("Select an workspace before loading integrations.")
    }

    return apiFetch<IntegrationStatuses>(
      "/api/workspace/settings/integrations",
      integrationRequestOptions(workspaceId, { signal }),
    )
  },
})

export const aiModelsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) => queryOptions({
  queryKey: aiModelsQueryKey(workspaceId),
  enabled: Boolean(workspaceId),
  queryFn: ({ signal }) =>
    apiFetch<WorkspaceAiModelsResponse>(
      "/api/workspace/settings/ai/models",
      integrationRequestOptions(workspaceId, { signal }),
    ),
})

export const aiProvidersQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) => queryOptions({
  queryKey: aiProvidersQueryKey(workspaceId),
  enabled: Boolean(workspaceId),
  queryFn: ({ signal }) =>
    apiFetch<WorkspaceAiProvidersResponse>(
      "/api/workspace/settings/ai",
      integrationRequestOptions(workspaceId, { signal }),
    ),
})

export function integrationRequestOptions(
  workspaceId: string | null | undefined,
  init?: RequestInit,
): RequestInit {
  if (!workspaceId) {
    return init ?? {}
  }

  const headers = new Headers(init?.headers)
  headers.set("x-zilobase-workspace-id", workspaceId)

  return { ...init, headers }
}
