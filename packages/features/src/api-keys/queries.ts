import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type ApiKeyRecord = {
  createdAt: string
  enabled: boolean
  expiresAt: string | null
  id: string
  lastRequest: string | null
  name: string
  workspaceId: string | null
  prefix: string | null
  requestCount: number
  start: string | null
  updatedAt: string
}

export type ApiKeysResponse = {
  keys: ApiKeyRecord[]
}

export type CreatedApiKeyRecord = ApiKeyRecord & {
  key: string
}

export const apiKeysQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspaces", workspaceId ?? "none", "api-keys"] as const

export const apiKeysQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) => queryOptions({
  queryKey: apiKeysQueryKey(workspaceId),
  enabled: Boolean(workspaceId),
  queryFn: ({ signal }) => {
    if (!workspaceId) {
      throw new Error("Select an workspace before loading API keys.")
    }

    return apiFetch<ApiKeysResponse>(
      `/api/keys?workspaceId=${encodeURIComponent(workspaceId)}`,
      { signal },
    )
  },
})
