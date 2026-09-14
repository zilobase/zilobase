import { useEffect, useMemo } from "react"

import { useDatabaseRecords } from "@zilobase/features/databases/react"

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
  const metadata = useDatabaseMetadata(databaseId, {
    includeDeleted: options?.includeDeleted,
  })
  const activeDataSourceId = metadata.data?.activeDataSource?.id ?? null
  const view = metadata.data?.views.find(
    (candidate) => candidate.dataSourceId === activeDataSourceId,
  ) ?? null
  const records = useDatabaseRecords(
    (options?.enabled ?? true) && databaseId && activeDataSourceId && view
      ? {
          databaseId,
          dataSourceId: activeDataSourceId,
          includeDeleted: options?.includeDeleted,
          viewId: view.id,
        }
      : null,
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
    metadata.data,
    options?.enabled,
    records.hasMore,
    records.records,
    records.status,
    records.totalCount,
    view,
  ])

  const enabled = options?.enabled ?? true
  const loadingAll = Boolean(enabled && options?.loadAll && records.hasMore)

  return {
    data,
    error: metadata.error ?? records.error,
    fetchNextPage: records.fetchNextPage,
    hasMore: records.hasMore,
    isComplete: enabled && records.status === "success" && !records.hasMore,
    isFetchingNextPage: records.isFetchingNextPage,
    isLoading: enabled && (metadata.isLoading || records.status === "loading" || loadingAll),
  }
}
