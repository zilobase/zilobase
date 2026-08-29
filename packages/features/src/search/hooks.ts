import { useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import { appSearchQueryOptions } from "./queries"
import type { AppSearchResultType } from "./queries"

export function useAppSearchResults(
  workspaceId: string | null | undefined,
  query: string,
  enabled?: boolean,
  types?: AppSearchResultType[],
) {
  const { apiFetch } = useZilobaseFeatures()

  return useQuery(appSearchQueryOptions(apiFetch, workspaceId, query, enabled, types))
}
