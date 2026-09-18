import type {
  DatabaseBootstrapResponse,
  DatabaseRecordEntity,
  DataSourceEntity,
} from "@zilobase/features/databases"

import { getDatabaseViewIcon } from "./database-view-config"

/**
 * Interactive view data: bootstrap slices plus loaded records. Unlike the
 * export payload, rows keep their record identity (orderKey,
 * valuesByPropertyId) and views/properties use the v2 entity shapes.
 */
export type DatabaseViewData = {
  activeDataSource: DataSourceEntity | null
  bootstrap: DatabaseBootstrapResponse
  dataSourceId: string | null
  hasMore: boolean
  records: DatabaseRecordEntity[]
  totalCount: number
}

export function composeDatabaseViewData(input: {
  bootstrap: DatabaseBootstrapResponse | undefined
  dataSourceId: string | null
  hasMore: boolean
  records: DatabaseRecordEntity[]
  totalCount: number
}): DatabaseViewData | undefined {
  const { bootstrap } = input
  if (!bootstrap) return undefined
  const activeDataSource = bootstrap.dataSources.find(
    ({ id }) => id === input.dataSourceId,
  ) ?? bootstrap.dataSources[0] ?? null
  const dataSourceId = activeDataSource?.id ?? null
  const records = dataSourceId
    ? input.records.filter((record) => record.dataSourceId === dataSourceId)
    : []

  return {
    activeDataSource,
    bootstrap,
    dataSourceId,
    hasMore: input.hasMore,
    records,
    totalCount: input.totalCount,
  }
}

export function getDatabaseDataSourceSummaries(
  dataSources:
    | Array<{
      config?: unknown
      id: string
      name: string
      parentDatabaseId: string
      position?: number
    }>
    | null
    | undefined,
  views: Array<{ dataSourceId: string }> | null | undefined,
) {
  return (dataSources ?? []).map((source) => ({
    config: source.config,
    hiddenViewCount: 0,
    id: source.id,
    name: source.name || "Untitled data source",
    parentDatabaseId: source.parentDatabaseId,
    position: source.position,
    viewCount:
      views?.filter((view) => view.dataSourceId === source.id).length ?? 0,
  }))
}

export function getDatabaseViewTabs(
  dataSources:
    | Array<{
      id: string
      name: string
      parentDatabaseId: string
    }>
    | null
    | undefined,
  views:
    | Array<{
      config?: unknown
      dataSourceId: string
      id: string
      name: string
      type: string
    }>
    | null
    | undefined,
) {
  return (views ?? []).map((view) => ({
    icon: getDatabaseViewIcon(view.config),
    id: view.id,
    name: view.name,
    dataSourceId: view.dataSourceId,
    dataSourceName: dataSources?.find(
      (source) => source.id === view.dataSourceId,
    )?.name,
    sourceParentDatabaseId: dataSources?.find(
      (source) => source.id === view.dataSourceId,
    )?.parentDatabaseId,
    type: view.type,
  }))
}

export function resolveRequestedDatabaseViewId({
  requestedViewId,
  viewTabs,
}: {
  requestedViewId: string | null | undefined
  viewTabs: Array<{ id: string }>
}) {
  return requestedViewId && viewTabs.some((view) => view.id === requestedViewId)
    ? requestedViewId
    : null
}

export function shouldUseDatabaseSetupMode({
  dataSettled,
  editable,
  hasContent,
  setupDismissed,
  setupMode,
}: {
  dataSettled: boolean
  editable: boolean
  hasContent: boolean
  setupDismissed: boolean
  setupMode: boolean
}) {
  return Boolean(
    editable && !setupDismissed && dataSettled && (setupMode || !hasContent),
  )
}
