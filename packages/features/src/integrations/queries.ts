import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

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

export const aiModelsQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "ai-models"] as const
export const aiProvidersQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "ai-providers"] as const

export const aiModelsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) => queryOptions({
  queryKey: aiModelsQueryKey(workspaceId),
  enabled: Boolean(workspaceId),
  queryFn: ({ signal }) =>
    apiFetch<WorkspaceAiModelsResponse>(
      "/api/workspace/settings/ai/models",
      workspaceRequestOptions(workspaceId, { signal }),
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
      workspaceRequestOptions(workspaceId, { signal }),
    ),
})

export function workspaceRequestOptions(
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
