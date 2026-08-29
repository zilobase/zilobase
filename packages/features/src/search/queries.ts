import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/context"

export type AppSearchResult = {
  emoji: string | null
  id: string
  path: string
  title: string
  type: "database" | "page"
}

export type AppSearchResultType = AppSearchResult["type"]

export const appSearchQueryKey = (
  workspaceId: string | null | undefined,
  query: string,
  types?: AppSearchResultType[],
) => ["search", workspaceId ?? "none", query, types?.join(",") ?? "all"] as const

export const appSearchQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  query: string,
  enabled = true,
  types?: AppSearchResultType[],
) =>
  queryOptions({
    queryKey: appSearchQueryKey(workspaceId, query, types),
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
      if (types?.length) params.set("types", types.join(","))

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
