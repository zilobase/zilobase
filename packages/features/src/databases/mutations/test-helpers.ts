import type { QueryClient } from "@tanstack/react-query"

import {
  databaseBootstrapQueryKey,
  databaseWindowQueryKey,
} from "../queries/keys"
import type {
  DatabaseBootstrapResponse,
  DatabaseRecordWindowResponse,
} from  "../core/entities"
import { databaseOrderKeyAtPosition } from  "../core/order-key"
import type { DatabaseExportPayload } from  "../queries/queries"

export function createTestDatabasePayload(
  overrides: Partial<DatabaseExportPayload> = {},
): DatabaseExportPayload {
  const defaultDataSource = {
    configVersion: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    id: "data-source-1",
    name: "Projects",
    parentDatabaseId: "database-1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    version: 0,
    workspaceId: "org-1",
  }

  return {
    activeDataSource:
      overrides.activeDataSource === undefined
        ? defaultDataSource
        : overrides.activeDataSource,
    dataSources: overrides.dataSources ?? [defaultDataSource],
    database: {
      createdAt: "2026-06-01T00:00:00.000Z",
      id: "database-1",
      name: "Projects",
      workspaceId: "org-1",
      pageId: "page-root",
      updatedAt: "2026-06-01T00:00:00.000Z",
      version: 0,
      ...overrides.database,
    },
    properties: overrides.properties ?? [
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        dataSourceId: "data-source-1",
        id: "column-status",
        position: 0,
        property: {
          createdAt: "2026-06-01T00:00:00.000Z",
          id: "property-status",
          name: "Status",
          workspaceId: "org-1",
          type: "status",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        propertyId: "property-status",
        updatedAt: "2026-06-01T00:00:00.000Z",
        visible: true,
      },
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        dataSourceId: "data-source-1",
        id: "column-name",
        position: 1,
        property: {
          createdAt: "2026-06-01T00:00:00.000Z",
          id: "property-name",
          name: "Name",
          workspaceId: "org-1",
          type: "text",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        propertyId: "property-name",
        updatedAt: "2026-06-01T00:00:00.000Z",
        visible: true,
      },
    ],
    rows: overrides.rows ?? [
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        dataSourceId: "data-source-1",
        id: "row-1",
        page: {
          id: "page-1",
          name: "Alpha",
        },
        pageId: "page-1",
        position: 0,
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        dataSourceId: "data-source-1",
        id: "row-2",
        page: {
          id: "page-2",
          name: "Beta",
        },
        pageId: "page-2",
        position: 1,
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    values: overrides.values ?? [
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        id: "value-1",
        propertyId: "property-status",
        updatedAt: "2026-06-01T00:00:00.000Z",
        value: "Not started",
        pageId: "page-1",
      },
    ],
    views: overrides.views ?? [
      {
        config: {},
        createdAt: "2026-06-01T00:00:00.000Z",
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        id: "view-table",
        name: "Table",
        position: 0,
        type: "table",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    rowCount: overrides.rowCount,
    rowsPagination: overrides.rowsPagination,
  }
}

export function setTestDatabaseClientState(
  queryClient: QueryClient,
  payload: DatabaseExportPayload,
) {
  const bootstrap: DatabaseBootstrapResponse = {
    database: {
      accessLevel: payload.database.accessLevel ?? null,
      config: payload.database.config ?? {},
      createdAt: payload.database.createdAt,
      id: payload.database.id,
      name: payload.database.name,
      pageId: payload.database.pageId,
      updatedAt: payload.database.updatedAt,
      version: payload.database.version,
      workspaceId: payload.database.workspaceId,
    },
    dataSources: payload.dataSources.map((source, position) => ({
      config: source.config ?? {},
      configVersion: source.configVersion,
      createdAt: source.createdAt,
      id: source.id,
      linkedAt: source.linkedAt ?? null,
      name: source.name,
      parentDatabaseId: source.parentDatabaseId,
      position: source.position ?? position,
      updatedAt: source.updatedAt,
      version: source.version,
      workspaceId: source.workspaceId,
    })),
    properties: payload.properties.map((property) => ({
      ...property,
      property: {
        ...property.property,
        config: property.property.config ?? {},
      },
      width: property.width ?? null,
    })),
    views: payload.views.map((view) => ({
      ...view,
      config: view.config ?? {},
    })),
  }
  queryClient.setQueryData(
    databaseBootstrapQueryKey("test-session", {
      databaseId: payload.database.id,
    }),
    bootstrap,
  )

  for (const source of bootstrap.dataSources) {
    const view = bootstrap.views.find(({ dataSourceId }) => dataSourceId === source.id)
    if (!view) continue
    const records = payload.rows
      .filter(({ dataSourceId }) => dataSourceId === source.id)
      .map((row) => ({
        createdAt: row.createdAt,
        dataSourceId: row.dataSourceId,
        id: row.id,
        orderKey: databaseOrderKeyAtPosition(row.position),
        page: {
          createdAt: row.createdAt,
          deletedAt: null,
          hasContent: false,
          id: row.page.id,
          metadata: row.page.metadata ?? {},
          name: row.page.name,
          updatedAt: row.updatedAt,
        },
        pageId: row.pageId,
        parentRowId: row.parentRowId ?? null,
        updatedAt: row.updatedAt,
        valuesByPropertyId: Object.fromEntries(
          payload.values
            .filter(({ pageId }) => pageId === row.pageId)
            .map((value) => [value.propertyId, value]),
        ),
      }))
    const window: DatabaseRecordWindowResponse = {
      databaseVersion: payload.database.version,
      dataSourceVersion: source.version,
      hasMore: false,
      offset: 0,
      records,
      snapshot: "test-snapshot",
      totalCount: records.length,
    }
    queryClient.setQueryData(
      databaseWindowQueryKey("test-session", {
        databaseId: payload.database.id,
        dataSourceId: source.id,
        viewId: view.id,
      }),
      { pageParams: [{ limit: 50, snapshot: undefined }], pages: [window] },
    )
  }
}
