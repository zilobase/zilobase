import type { QueryClient } from "@tanstack/react-query"

import { applyNavDelta, type NavDelta } from "./nav-delta"
import {
  pagesNavRootQueryKey,
  type PageNavigationPayload,
} from "./queries"
export * from "./navigation-realtime-contract"

export function applyNavigationDeltaToCache(
  queryClient: QueryClient,
  workspaceId: string,
  delta: NavDelta | null | undefined,
) {
  if (!delta) return false
  const queryKey = pagesNavRootQueryKey(workspaceId)
  const hasSnapshot = queryClient
    .getQueriesData<PageNavigationPayload>({ queryKey })
    .some(([, current]) => current !== undefined)

  if (!hasSnapshot) {
    void queryClient.invalidateQueries({ queryKey })
    return false
  }

  queryClient.setQueriesData<PageNavigationPayload | undefined>(
    { queryKey },
    (current) => applyNavDelta(current, delta),
  )
  return true
}
