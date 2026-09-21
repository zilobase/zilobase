import type { QueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"

import { useZilobaseFeatures } from "../../shared/context"
import { pageQueryKey } from "../../pages/queries"
import type { PageDetail, PagePropertiesPayload } from "../../pages/contracts"
import { pagePropertiesQueryKey } from "../../pages/queries"

function subscribeToPageQueries(
  queryClient: QueryClient,
  onStoreChange: () => void,
) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event?.query.queryKey[0] !== "page") {
      return
    }

    onStoreChange()
  })
}

/**
 * Best-effort host resolution for row pages.
 *
 * If explicitDatabaseId is truthy it is returned immediately. Otherwise the
 * page detail (["page", pageId] -> databaseIds) and page-properties
 * (["page", pageId, "properties"] -> databaseIds + presenceTargets) are read.
 * The first candidate is returned or null.
 *
 * Documented limitation: multi-homed row pages (linked sources, multiple
 * hosts) REQUIRE explicitDatabaseId at the call site. Best-effort [0] is only
 * a fallback. Page-metadata presence already subscribes to ALL presenceTargets,
 * so presence still works. Command scope for multi-homed rows must use the
 * explicit host.
 */
export function useDatabaseIdForRowPage(
  pageId: string | null | undefined,
  explicitDatabaseId?: string | null,
) {
  const { queryClient } = useZilobaseFeatures()

  const resolvedFromCache = useSyncExternalStore(
    (onStoreChange) => {
      if (!pageId) {
        return () => {}
      }

      return subscribeToPageQueries(queryClient, onStoreChange)
    },
    () => {
      if (!pageId) {
        return null
      }

      return findDatabaseIdForRowPage(queryClient, pageId)
    },
    () => {
      if (!pageId) {
        return null
      }

      return findDatabaseIdForRowPage(queryClient, pageId)
    },
  )

  if (explicitDatabaseId) {
    return explicitDatabaseId
  }

  return resolvedFromCache
}

export function findDatabaseIdForRowPage(
  queryClient: QueryClient,
  pageId: string,
): string | null {
  return findDatabaseIdsForRowPage(queryClient, pageId)[0] ?? null
}

export function findDatabaseIdsForRowPage(
  queryClient: QueryClient,
  pageId: string,
): string[] {
  const databaseIds: string[] = []
  const detail = queryClient.getQueryData<PageDetail | null>(
    pageQueryKey(pageId),
  )
  if (detail?.databaseIds) databaseIds.push(...detail.databaseIds)
  const properties = queryClient.getQueryData<PagePropertiesPayload | undefined>(
    pagePropertiesQueryKey(pageId),
  )
  if (properties?.databaseIds) databaseIds.push(...properties.databaseIds)
  for (const target of properties?.presenceTargets ?? []) {
    if (target.databaseId) databaseIds.push(target.databaseId)
  }
  return [...new Set(databaseIds)]
}
