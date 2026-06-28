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
  workspaceId: string | null | undefined,
  query: string,
) => ["search", workspaceId ?? "none", query] as const

export const appSearchQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  query: string,
  enabled = true,
) =>
  queryOptions({
    queryKey: appSearchQueryKey(workspaceId, query),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      if (!workspaceId) {
        return []
      }

      const params = new URLSearchParams({
        workspaceId,
        q: query,
      })

      try {
        const result = await apiFetch<{ results: AppSearchResult[] }>(
          `/search?${params.toString()}`,
          { method: "GET", signal },
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
