import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { useZilobaseFeatures } from "../shared/context";
import {
  databaseAccessQueryOptions,
  databaseQueryOptions,
} from "./queries";

export function useDatabase(
  databaseId: string | null | undefined,
  options?: {
    dataSourceId?: string;
    includeDeleted?: boolean;
    schemaOnly?: boolean;
    viewId?: string;
  },
) {
  const { apiFetch } = useZilobaseFeatures();
  const query = useQuery(databaseQueryOptions(apiFetch, databaseId, options));
  const hasNextPage = false;

  const fetchNextPage = useCallback(async () => {
    return;
  }, []);

  return {
    ...query,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: false,
  };
}

export function useDatabaseAccess(databaseId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAccessQueryOptions(apiFetch, databaseId));
}
