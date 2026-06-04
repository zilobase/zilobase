import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type AppSearchResult = {
  emoji: string | null
  id: string
  path: string
  title: string
  type: "database" | "page"
}

export const appSearchQueryKey = (
  organizationId: string | null | undefined,
  query: string,
) => ["search", organizationId ?? "none", query] as const

export const appSearchQueryOptions = (
  apiFetch: ApiFetcher,
  organizationId: string | null | undefined,
  query: string,
  enabled = true,
) =>
  queryOptions({
    queryKey: appSearchQueryKey(organizationId, query),
    enabled: Boolean(organizationId) && enabled,
    staleTime: 15_000,
    queryFn: async () => {
      if (!organizationId) {
        return []
      }

      const params = new URLSearchParams({
        organizationId,
        q: query,
      })

      try {
        const result = await apiFetch<{ results: AppSearchResult[] }>(
          `/search?${params.toString()}`,
          { method: "GET" },
        )

        return result.results
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return []
        }

        throw error
      }
    },
  })
