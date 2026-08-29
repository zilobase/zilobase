import type { DatabasePayload } from "@zilobase/features/databases"

import { getDatabaseViewIcon } from "../views/model/database-view-config"

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
