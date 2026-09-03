import assert from "node:assert/strict"
import test from "node:test"

import { applyDatabaseDelta } from "./apply-delta"
import { applyOptimisticAddedDatabaseRow } from "./add-row-cache"
import { createTestDatabasePayload } from "./test-helpers"

test("applyDatabaseDelta updates database metadata", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    database: {
      name: "Roadmap",
    },
  })

  assert.equal(next.database.name, "Roadmap")
})

test("applyDatabaseDelta updates a background source without replacing the active source", () => {
  const payload = createTestDatabasePayload()
  const sourceBase = {
    configVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    parentDatabaseId: "database-1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 0,
    workspaceId: "workspace-1",
  }
  payload.activeDataSource = { ...sourceBase, id: "source-1", name: "Tasks" }
  payload.dataSources = [
    payload.activeDataSource,
    { ...sourceBase, id: "source-2", name: "Projects" },
  ]

  const next = applyDatabaseDelta(payload, {
    dataSource: { id: "source-2", name: "Roadmap" },
  })

  assert.equal(next.activeDataSource?.id, "source-1")
  assert.equal(next.activeDataSource?.name, "Tasks")
  assert.equal(next.dataSources?.find(({ id }) => id === "source-2")?.name, "Roadmap")
})

test("applyDatabaseDelta patches an existing cell value", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    values: [
      {
        propertyId: "property-status",
        updatedAt: "2026-06-24T12:00:00.000Z",
        value: "Done",
        pageId: "page-1",
      },
    ],
  })

  assert.equal(next.values.length, 1)
  assert.equal(next.values[0]?.value, "Done")
  assert.equal(next.values[0]?.id, "value-1")
})

test("applyDatabaseDelta inserts a new cell value", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    values: [
      {
        propertyId: "property-name",
        updatedAt: "2026-06-24T12:00:00.000Z",
        value: "Gamma",
        pageId: "page-2",
      },
    ],
  })

  assert.equal(next.values.length, 2)
  assert.deepEqual(
    next.values.find(
      (value) =>
        value.pageId === "page-2" && value.propertyId === "property-name",
    ),
    {
      createdAt: next.values[1]?.createdAt,
      id: next.values[1]?.id,
      propertyId: "property-name",
      updatedAt: "2026-06-24T12:00:00.000Z",
      value: "Gamma",
      pageId: "page-2",
    },
  )
})

test("applyDatabaseDelta reorders rows by position patch", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    rows: [
      { id: "row-2", position: 0 },
      { id: "row-1", position: 1 },
    ],
  })

  assert.deepEqual(
    next.rows.map((row) => row.id),
    ["row-2", "row-1"],
  )
})

test("applyDatabaseDelta inserts a new row with nested page data", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    rows: [
      {
        id: "row-3",
        page: {
          id: "page-3",
          name: "Gamma",
        },
        pageId: "page-3",
        position: 2,
      },
    ],
  })

  assert.equal(next.rows.length, 3)
  assert.equal(next.rows[2]?.page.name, "Gamma")
})

test("applyDatabaseDelta replaces a matching optimistic row from realtime", () => {
  const payload = createTestDatabasePayload({ rowCount: 2 })
  const optimistic = applyOptimisticAddedDatabaseRow(payload, {
    title: "Untitled",
    values: [
      { propertyId: "property-status", value: "In progress" },
    ],
  })
  const next = applyDatabaseDelta(optimistic.payload, {
    rows: [
      {
        id: "row-3",
        page: { id: "page-3", name: "Untitled" },
        pageId: "page-3",
        position: 2,
      },
    ],
    values: [
      {
        id: "value-server",
        pageId: "page-3",
        propertyId: "property-status",
        updatedAt: "2026-08-06T12:00:00.000Z",
        value: "Not started",
      },
    ],
  })

  assert.equal(next.rowCount, 3)
  assert.equal(next.rows.length, 3)
  assert.equal(next.rows.some((row) => row.id === optimistic.rowId), false)
  assert.equal(next.rows.at(-1)?.id, "row-3")
  assert.equal(
    next.values.find(
      (value) =>
        value.pageId === "page-3" &&
        value.propertyId === "property-status",
    )?.value,
    "In progress",
  )
  assert.equal(
    next.values.some((value) => value.pageId === optimistic.pageId),
    false,
  )
})

test("applyDatabaseDelta removes a moved row and its source values", () => {
  const payload = createTestDatabasePayload({ rowCount: 2 })
  const removedPageId = payload.rows[0]!.pageId
  const next = applyDatabaseDelta(payload, {
    removedRowIds: [payload.rows[0]!.id],
    rows: [{ id: payload.rows[1]!.id, position: 0 }],
  })

  assert.deepEqual(
    next.rows.map((row) => ({ id: row.id, position: row.position })),
    [{ id: payload.rows[1]!.id, position: 0 }],
  )
  assert.equal(
    next.values.some((value) => value.pageId === removedPageId),
    false,
  )
  assert.equal(next.rowCount, 1)
})

test("applyDatabaseDelta adds source database columns with dragged row values", () => {
  const payload = createTestDatabasePayload({ rowCount: 2 })
  const next = applyDatabaseDelta(payload, {
    properties: [
      {
        createdAt: "2026-06-24T12:00:00.000Z",
        databaseId: "database-1",
        id: "column-url",
        position: 2,
        property: {
          createdAt: "2026-06-01T00:00:00.000Z",
          id: "property-url",
          name: "URL",
          workspaceId: "org-1",
          type: "url",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        propertyId: "property-url",
        updatedAt: "2026-06-24T12:00:00.000Z",
        visible: true,
      },
    ],
    rows: [
      {
        id: "row-3",
        page: {
          id: "page-3",
          name: "Gamma",
        },
        pageId: "page-3",
        position: 2,
      },
    ],
    values: [
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        id: "value-url",
        propertyId: "property-url",
        updatedAt: "2026-06-01T00:00:00.000Z",
        value: "https://example.com",
        pageId: "page-3",
      },
    ],
  })

  assert.equal(next.properties.at(-1)?.property.name, "URL")
  assert.equal(next.rows.at(-1)?.pageId, "page-3")
  assert.equal(next.rowCount, 3)
  assert.equal(next.values.at(-1)?.value, "https://example.com")
})

test("applyDatabaseDelta removes properties by id", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    removedPropertyIds: ["column-name"],
  })

  assert.deepEqual(
    next.properties.map((property) => property.id),
    ["column-status"],
  )
})

test("applyDatabaseDelta upserts views and sorts by position", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    views: [
      {
        id: "view-kanban",
        name: "Kanban",
        position: 1,
        type: "kanban",
      },
      {
        id: "view-table",
        name: "Main table",
        position: 0,
      },
    ],
  })

  assert.equal(next.views.length, 2)
  assert.equal(next.views[0]?.id, "view-table")
  assert.equal(next.views[0]?.name, "Main table")
  assert.equal(next.views[1]?.id, "view-kanban")
})

test("applyDatabaseDelta removes views by id", () => {
  const payload = createTestDatabasePayload({
    views: [
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
      {
        config: {},
        createdAt: "2026-06-01T00:00:00.000Z",
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        id: "view-kanban",
        name: "Kanban",
        position: 1,
        type: "kanban",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  })
  const next = applyDatabaseDelta(payload, {
    removedViewIds: ["view-table"],
  })

  assert.deepEqual(
    next.views.map((view) => view.id),
    ["view-kanban"],
  )
})

test("applyDatabaseDelta applies combined patches in one pass", () => {
  const payload = createTestDatabasePayload()
  const next = applyDatabaseDelta(payload, {
    properties: [
      {
        id: "column-status",
        position: 1,
      },
      {
        id: "column-name",
        position: 0,
      },
    ],
    rows: [
      {
        id: "row-1",
        lastEditedById: "user-1",
        updatedAt: "2026-06-24T12:00:00.000Z",
      },
    ],
    values: [
      {
        propertyId: "property-status",
        updatedAt: "2026-06-24T12:00:00.000Z",
        value: "In progress",
        pageId: "page-1",
      },
    ],
  })

  assert.deepEqual(
    next.properties.map((property) => property.id),
    ["column-name", "column-status"],
  )
  assert.equal(next.rows[0]?.lastEditedById, "user-1")
  assert.equal(next.values[0]?.value, "In progress")
})
