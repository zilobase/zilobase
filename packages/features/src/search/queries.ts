import { normalizeSearchReferences } from "./references";
import { sharedClient } from "../data/client";
import type { AppSearchResult, AppSearchResultType } from "./contracts";
import { queryOptions } from "@tanstack/react-query";

import type { ApiFetcher } from "../shared/api-fetcher";

export const appSearchQueryKey = (
  workspaceId: string | null | undefined,
  query: string,
  types?: AppSearchResultType[],
) => ["search", workspaceId ?? "none", query, types?.join(",") ?? "all"] as const;

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
    queryFn: async ({ client, signal }) => {
      if (!workspaceId) {
        return [];
      }

      const read = sharedClient(client).capture();
      const params = new URLSearchParams({
        workspaceId,
        q: query,
      });
      if (types?.length) params.set("types", types.join(","));

      try {
        const result = await apiFetch<{
          results: Array<AppSearchResult & { entity: unknown; excerpt?: string | null }>;
        }>(`/search?${params.toString()}`, { method: "GET", signal });

        return normalizeSearchReferences(client, read, workspaceId, result.results);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return [];
        }

        throw error;
      }
    },
  });
