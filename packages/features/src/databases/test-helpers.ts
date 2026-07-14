import type { DatabasePayload } from "./queries"

export function createTestDatabasePayload(
  overrides: Partial<DatabasePayload> = {},
): DatabasePayload {
  return {
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
        databaseId: "database-1",
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
        databaseId: "database-1",
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
        databaseId: "database-1",
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
        databaseId: "database-1",
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
