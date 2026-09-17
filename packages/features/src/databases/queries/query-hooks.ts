import { useQuery } from "@tanstack/react-query";

import { useZilobaseFeatures } from  "../../shared/context";
import { databaseAccessQueryOptions } from  "../queries/queries";

export function useDatabaseAccess(databaseId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAccessQueryOptions(apiFetch, databaseId));
}
