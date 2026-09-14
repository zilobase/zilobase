import { useEffect, useMemo } from "react"

import { useOptionalDatabaseClient } from "@zilobase/features/databases"
import {
  useDatabase,
  useDatabaseRecords,
} from "@zilobase/features/databases/react"

import { composeDatabaseControllerPayload } from "../views/model/database-controller-state"
import { useDatabaseMetadata } from "./use-database-metadata"

export function useDatabaseSecondaryPayload(
  databaseId: string | null | undefined,
  options?: {
    enabled?: boolean
    includeDeleted?: boolean
    loadAll?: boolean
  },
) {
  const databaseClient = useOptionalDatabaseClient()
  const useCollections = Boolean(databaseClient)
  const metadata = useDatabaseMetadata(databaseId, {
    includeDeleted: options?.includeDeleted,
  })
  const activeDataSourceId = metadata.data?.activeDataSource?.id ?? null
  const view = metadata.data?.views.find(
    (candidate) => candidate.dataSourceId === activeDataSourceId,
  ) ?? null
  const records = useDatabaseRecords(
    (options?.enabled ?? true) && useCollections && databaseId && activeDataSourceId && view
      ? {
          databaseId,
          dataSourceId: activeDataSourceId,
          includeDeleted: options?.includeDeleted,
          viewId: view.id,
        }
      : null,
  )
  const legacy = useDatabase(
    !useCollections && (options?.enabled ?? true) ? databaseId : null,
    {
      includeDeleted: options?.includeDeleted,
      schemaOnly: false,
    },
  )

  useEffect(() => {
    if (
      !options?.loadAll ||
      options.enabled === false ||
      records.status !== "success" ||
      !records.hasMore ||
      records.isFetchingNextPage
    ) {
      return
    }
    void records.fetchNextPage()
  }, [
    options?.loadAll,
    options?.enabled,
    records.fetchNextPage,
    records.hasMore,
    records.isFetchingNextPage,
    records.records.length,
    records.status,
  ])

  const data = useMemo(() => {
    if (options?.enabled === false) return undefined
    if (!useCollections) return legacy.data
    if (!metadata.data || !activeDataSourceId || !view) return undefined
    if (records.status !== "success") return undefined

    return composeDatabaseControllerPayload({
      bootstrap: metadata.data,
      dataSourceId: activeDataSourceId,
      hasMore: records.hasMore,
      records: records.records,
      totalCount: records.totalCount,
    })
  }, [
    activeDataSourceId,
    legacy.data,
    metadata.data,
    options?.enabled,
    records.hasMore,
    records.records,
    records.status,
    records.totalCount,
    useCollections,
    view,
  ])

  const enabled = options?.enabled ?? true
  const loadingAll = Boolean(enabled && options?.loadAll && records.hasMore)

  return {
    data,
    error: useCollections ? metadata.error ?? records.error : legacy.error,
    fetchNextPage: records.fetchNextPage,
    hasMore: useCollections ? records.hasMore : false,
    isComplete: useCollections
      ? enabled && records.status === "success" && !records.hasMore
      : enabled && !legacy.isLoading,
    isFetchingNextPage: records.isFetchingNextPage,
    isLoading: useCollections
      ? enabled && (metadata.isLoading || records.status === "loading" || loadingAll)
      : enabled && legacy.isLoading,
  }
}
