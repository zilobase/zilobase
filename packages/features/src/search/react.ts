import { resolveSearchReferences } from "./references";
import { useSharedDataRevision } from "../data/react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useZilobaseFeatures } from "../shared/context";
import {
  workspaceSearchSettingsQueryOptions,
  updateWorkspaceSearchSettings,
  reindexWorkspaceSearch,
} from "./settings";
import { appSearchQueryOptions } from "./queries";
import type { AppSearchResultType, SearchMode } from "./contracts";

export function useAppSearchResults(
  workspaceId: string | null | undefined,
  query: string,
  enabled?: boolean,
  types?: AppSearchResultType[],
  mode: SearchMode = "keyword",
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  const result = useQuery(
    appSearchQueryOptions(apiFetch, workspaceId, query, enabled, types, mode),
  );
  useSharedDataRevision(queryClient);
  return {
    metadata: result.data?.metadata,
    error: result.error,
    isLoading: result.isLoading,
    isPending: result.isPending,
    isFetching: result.isFetching,
    isError: result.isError,
    isSuccess: result.isSuccess,
    status: result.status,
    refetch: result.refetch,
    data: result.data && resolveSearchReferences(queryClient, result.data.results),
  };
}

export function useWorkspaceSearchSettings(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(workspaceSearchSettingsQueryOptions(apiFetch, workspaceId));
}
export function useUpdateWorkspaceSearchSettings(workspaceId: string | null | undefined) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!workspaceId) throw new Error("Workspace is required");
      return updateWorkspaceSearchSettings(apiFetch, workspaceId, enabled);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["search-settings", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["search", workspaceId] });
    },
  });
}
export function useReindexWorkspaceSearch(workspaceId: string | null | undefined) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace is required");
      return reindexWorkspaceSearch(apiFetch, workspaceId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["search-settings", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["search", workspaceId] });
    },
  });
}

import { workspaceSearchQueryOptions } from "./queries";
import type { WorkspaceSearchRequestInput } from "./controls";
export function useWorkspaceSearch(
  workspaceId: string | null | undefined,
  input: WorkspaceSearchRequestInput,
  enabled = true,
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const result = useQuery(workspaceSearchQueryOptions(apiFetch, workspaceId, input, enabled));
  useSharedDataRevision(queryClient);
  return {
    ...result,
    data:
      result.data?.type === "workspace_search"
        ? { ...result.data, results: resolveSearchReferences(queryClient, result.data.results) }
        : result.data,
  };
}
