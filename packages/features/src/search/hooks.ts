import { resolveSearchReferences } from "./references";
import { useSharedDataRevision } from "../data/react";
import { useQuery } from "@tanstack/react-query";

import { useZilobaseFeatures } from "../shared/context";
import { appSearchQueryOptions } from "./queries";
import type { AppSearchResultType } from "./contracts";

export function useAppSearchResults(
  workspaceId: string | null | undefined,
  query: string,
  enabled?: boolean,
  types?: AppSearchResultType[],
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  const result = useQuery(appSearchQueryOptions(apiFetch, workspaceId, query, enabled, types));
  useSharedDataRevision(queryClient);
  return {
    error: result.error,
    isLoading: result.isLoading,
    isPending: result.isPending,
    isFetching: result.isFetching,
    isError: result.isError,
    isSuccess: result.isSuccess,
    status: result.status,
    refetch: result.refetch,
    data: result.data && resolveSearchReferences(queryClient, result.data),
  };
}
