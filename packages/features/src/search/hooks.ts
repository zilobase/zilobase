import { useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import { appSearchQueryOptions } from "./queries"

export function useAppSearchResults(
  workspaceId: string | null | undefined,
  query: string,
  enabled?: boolean,
) {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(appSearchQueryOptions(apiFetch, workspaceId, query, enabled))
}
