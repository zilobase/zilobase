import { useQuery } from "@tanstack/react-query"

import { appSearchQueryOptions } from "@/features/search/queries"

export function useAppSearchResults(
  organizationId: string | null | undefined,
  query: string,
  enabled?: boolean,
) {
  return useQuery(appSearchQueryOptions(organizationId, query, enabled))
}
