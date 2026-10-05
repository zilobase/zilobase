import { resolveDatabaseAccessReferences } from "../../pages/access-references";
import { useSharedDataRevision } from "../../data/react";
import { useQuery } from "@tanstack/react-query";

import { useZilobaseFeatures } from "../../shared/context";
import { databaseAccessQueryOptions } from "../queries/queries";

export function useDatabaseAccess(databaseId: string | null | undefined) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery(databaseAccessQueryOptions(apiFetch, databaseId));
  useSharedDataRevision(queryClient);
  return {
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
    data: query.data && resolveDatabaseAccessReferences(queryClient, query.data),
  };
}
