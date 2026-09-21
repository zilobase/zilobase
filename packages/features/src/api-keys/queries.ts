import type { ApiKeysResponse } from "./contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/api-fetcher"

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
