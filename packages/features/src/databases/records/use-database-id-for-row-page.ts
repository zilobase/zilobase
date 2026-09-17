import type { QueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"

import { useZilobaseFeatures } from  "../../shared/context"

import { findDatabaseIdForRowPage } from  "../records/row-page-properties"

function subscribeToDatabaseQueries(
  queryClient: QueryClient,
  onStoreChange: () => void,
) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event?.query.queryKey[0] !== "database-client-v2") {
      return
    }

    onStoreChange()
  })
}

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

      return subscribeToDatabaseQueries(queryClient, onStoreChange)
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
