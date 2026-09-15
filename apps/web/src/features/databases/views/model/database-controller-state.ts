import type {
  DatabaseBootstrapResponse,
  DatabasePayload,
  DatabaseRecordEntity,
} from "@zilobase/features/databases"

import { getDatabaseViewIcon } from "./database-view-config"

export function composeDatabaseControllerPayload(input: {
  bootstrap: DatabaseBootstrapResponse | undefined
  dataSourceId: string | null
  hasMore: boolean
  records: DatabaseRecordEntity[]
  totalCount: number
}): DatabasePayload | undefined {
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
    activeDataSource: activeDataSource
      ? {
          config: activeDataSource.config,
          configVersion: activeDataSource.configVersion,
          createdAt: activeDataSource.createdAt,
          id: activeDataSource.id,
          ...(activeDataSource.linkedAt
            ? { linkedAt: activeDataSource.linkedAt }
            : {}),
          name: activeDataSource.name,
          parentDatabaseId: activeDataSource.parentDatabaseId,
          position: activeDataSource.position,
          updatedAt: activeDataSource.updatedAt,
          version: activeDataSource.version,
          workspaceId: activeDataSource.workspaceId,
        }
      : null,
    dataSources: bootstrap.dataSources.map((source) => ({
      config: source.config,
      configVersion: source.configVersion,
      createdAt: source.createdAt,
      id: source.id,
      ...(source.linkedAt ? { linkedAt: source.linkedAt } : {}),
      name: source.name,
      parentDatabaseId: source.parentDatabaseId,
      position: source.position,
      updatedAt: source.updatedAt,
      version: source.version,
      workspaceId: source.workspaceId,
    })),
    database: {
      accessLevel: bootstrap.database.accessLevel,
      config: bootstrap.database.config,
      createdAt: bootstrap.database.createdAt,
      id: bootstrap.database.id,
      name: bootstrap.database.name,
      pageId: bootstrap.database.pageId,
      updatedAt: bootstrap.database.updatedAt,
      version: bootstrap.database.version,
      workspaceId: bootstrap.database.workspaceId,
    },
    properties: bootstrap.properties.filter(
      (property) => property.dataSourceId === dataSourceId,
    ),
    rowCount: input.totalCount,
    rows: records.map((record, position) => ({
      createdAt: record.createdAt,
      dataSourceId: record.dataSourceId,
      id: record.id,
      page: {
        createdAt: record.page.createdAt,
        deletedAt: record.page.deletedAt,
        id: record.page.id,
        metadata: record.page.metadata,
        name: record.page.name,
        updatedAt: record.page.updatedAt,
      },
      pageId: record.pageId,
      parentRowId: record.parentRowId,
      position,
      updatedAt: record.updatedAt,
    })),
    rowsPagination: {
      hasMore: input.hasMore,
      nextCursor: input.hasMore ? records.length : null,
    },
    values: records.flatMap((record) =>
      Object.values(record.valuesByPropertyId),
    ),
    views: bootstrap.views,
  }
}

export function getDatabaseDataSourceSummaries(
  payload: DatabasePayload | null | undefined,
) {
  return (payload?.dataSources ?? []).map((source) => ({
    config: source.config,
    hiddenViewCount: 0,
    id: source.id,
    name: source.name || "Untitled data source",
    parentDatabaseId: source.parentDatabaseId,
    position: source.position,
    viewCount:
      payload?.views.filter((view) => view.dataSourceId === source.id).length ??
      0,
  }))
}

export function getDatabaseViewTabs(
  payload: DatabasePayload | null | undefined,
) {
  return (payload?.views ?? []).map((view) => ({
    icon: getDatabaseViewIcon(view.config),
    id: view.id,
    name: view.name,
    dataSourceId: view.dataSourceId,
    dataSourceName: payload?.dataSources.find(
      (source) => source.id === view.dataSourceId,
    )?.name,
    sourceParentDatabaseId: payload?.dataSources.find(
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
  editable,
  payload,
  setupDismissed,
  setupMode,
}: {
  editable: boolean
  payload: DatabasePayload | null | undefined
  setupDismissed: boolean
  setupMode: boolean
}) {
  const hasSetupContent = Boolean(
    payload &&
      (payload.properties.length > 0 ||
        (payload.rowCount ?? payload.rows.length) > 0 ||
        payload.dataSources.length > 1),
  )

  return Boolean(
    editable && payload && !setupDismissed && (setupMode || !hasSetupContent),
  )
}
