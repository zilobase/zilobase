import { useMemo } from "react"

import {
  useDatabaseBootstrap,
} from "@zilobase/features/databases/react"

export function useDatabaseMetadata(
  databaseId: string | null | undefined,
  options?: {
    dataSourceId?: string | null
    includeDeleted?: boolean
    viewId?: string | null
  },
) {
  const bootstrap = useDatabaseBootstrap(
    databaseId
      ? {
          databaseId,
          includeDeleted: options?.includeDeleted,
          viewId: options?.viewId,
        }
      : null,
  )
  const data = useMemo(() => {
    if (!bootstrap.data) return undefined

    const activeView = options?.viewId
      ? bootstrap.data.views.find((view) => view.id === options.viewId)
      : bootstrap.data.views[0]
    const activeDataSource = bootstrap.data.dataSources.find(
      (source) => source.id === (options?.dataSourceId ?? activeView?.dataSourceId),
    ) ?? bootstrap.data.dataSources[0] ?? null

    return {
      ...bootstrap.data,
      activeDataSource,
    }
  }, [bootstrap.data, options?.dataSourceId, options?.viewId])

  return {
    data,
    error: bootstrap.error,
    isError: bootstrap.status === "error",
    isLoading: bootstrap.status === "loading",
    refetch: bootstrap.refetch,
  }
}
