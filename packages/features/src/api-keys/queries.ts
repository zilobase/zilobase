import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type ApiKeyRecord = {
  createdAt: string
  enabled: boolean
  expiresAt: string | null
  id: string
  lastRequest: string | null
  name: string
  organizationId: string | null
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
  organizationId: string | null | undefined,
) => ["api-keys", organizationId ?? "none"] as const

export const apiKeysQueryOptions = (
  apiFetch: ApiFetcher,
  organizationId: string | null | undefined,
) => queryOptions({
  queryKey: apiKeysQueryKey(organizationId),
  enabled: Boolean(organizationId),
  queryFn: () => {
    if (!organizationId) {
      throw new Error("Select an organization before loading API keys.")
    }

    return apiFetch<ApiKeysResponse>(
      `/api/keys?organizationId=${encodeURIComponent(organizationId)}`,
    )
  },
})
