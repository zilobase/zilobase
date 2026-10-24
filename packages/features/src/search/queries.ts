import { normalizeSearchReferences } from "./references";
import { sharedClient } from "../data/client";
import type { AppSearchResult, AppSearchResultType, SearchMode, SearchMetadata } from "./contracts";
import { queryOptions } from "@tanstack/react-query";

import type { ApiFetcher } from "../shared/api-fetcher";

export const appSearchQueryKey = (
  workspaceId: string | null | undefined,
  query: string,
  types?: AppSearchResultType[],
  mode: SearchMode = "keyword",
) => ["search", workspaceId ?? "none", query, types?.join(",") ?? "all", mode] as const;

export const appSearchQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  query: string,
  enabled = true,
  types?: AppSearchResultType[],
  mode: SearchMode = "keyword",
) =>
  queryOptions({
    queryKey: appSearchQueryKey(workspaceId, query, types, mode),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 15_000,
    queryFn: async ({ client, signal }) => {
      if (!workspaceId) {
        return { results: [], metadata: undefined as SearchMetadata | undefined };
      }

      const read = await sharedClient(client).captureRead();
      const params = new URLSearchParams({
        workspaceId,
        q: query,
        mode,
      });
      if (types?.length) params.set("types", types.join(","));

      try {
        const result = await apiFetch<{
          results: Array<AppSearchResult & { entity: unknown; excerpt?: string | null }>;
          metadata?: SearchMetadata;
        }>(`/search?${params.toString()}`, { method: "GET", signal });

        return {
          results: normalizeSearchReferences(client, read, workspaceId, result.results),
          metadata: result.metadata,
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return { results: [], metadata: undefined as SearchMetadata | undefined };
        }

        throw error;
      }
    },
  });

import {
  normalizeWorkspaceSearch,
  searchUserSchema,
  type WorkspaceSearchRequestInput,
  type SearchUser,
} from "./controls";
import type { SearchReference } from "./references";
import { z } from "zod";
export const workspaceSearchQueryKey = (
  workspaceId: string | null | undefined,
  input: WorkspaceSearchRequestInput,
) => ["search", workspaceId ?? "none", "structured", normalizeWorkspaceSearch(input)] as const;
export type WorkspaceSearchQueryResult =
  | { type: "workspace_search"; results: SearchReference[]; exhaustive: false }
  | { type: "user_search"; users: SearchUser[]; exhaustive: false };
export function workspaceSearchQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  input: WorkspaceSearchRequestInput,
  enabled = true,
) {
  const request = normalizeWorkspaceSearch(input);
  return queryOptions({
    queryKey: workspaceSearchQueryKey(workspaceId, request),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 15_000,
    queryFn: async ({ client, signal }): Promise<WorkspaceSearchQueryResult> => {
      if (!workspaceId) throw new Error("Workspace is required");
      const owner = sharedClient(client),
        read = await owner.captureRead();
      const response = await apiFetch<
        | { type: "workspace_search"; results: unknown; exhaustive: false }
        | { type: "user_search"; users: unknown; exhaustive: false }
      >("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...request }),
        signal,
      });
      owner.resolve(read, workspaceId);
      if (request.queryType === "user") {
        if (response.type !== "user_search") throw new Error("Unexpected search response");
        return {
          type: response.type,
          users: z.array(searchUserSchema).parse(response.users),
          exhaustive: false,
        };
      }
      if (response.type !== "workspace_search") throw new Error("Unexpected search response");
      return {
        type: response.type,
        results: normalizeSearchReferences(client, read, workspaceId, response.results),
        exhaustive: false,
      };
    },
  });
}
