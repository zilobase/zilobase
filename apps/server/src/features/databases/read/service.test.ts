import assert from "node:assert/strict"
import { test, vi } from "vitest"

import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"
import {
  DatabaseWindowStaleError,
  getDatabaseBootstrapService,
  getDatabaseRecordWindowService,
} from "./service"

const instant = new Date("2026-09-14T10:00:00.000Z")

function databaseRecord() {
  return {
    config: {},
    createdAt: instant,
    createdById: "user-1",
    deletedAt: null,
    deletedById: null,
    id: "database-1",
    name: "Tasks",
    pageId: "host-page",
    teamspaceId: null,
    updatedAt: instant,
    version: 7,
    workspaceId: "workspace-1",
  }
}

function source(id = "source-1", position = 0) {
  return {
    config: {},
    configVersion: 1,
    createdAt: instant,
    createdById: "user-1",
    deletedAt: null,
    deletedById: null,
    id,
    linkedAt: instant,
    name: id,
    parentDatabaseId: "database-1",
    position,
    updatedAt: instant,
    version: 3,
    workspaceId: "workspace-1",
  }
}

function property(dataSourceId = "source-1") {
  return {
    createdAt: instant,
    dataSourceId,
    id: `column-${dataSourceId}`,
    position: 0,
    property: {
      config: null,
      createdAt: instant,
      deletedAt: null,
      deletedById: null,
      id: `property-${dataSourceId}`,
      name: "Score",
      type: "number",
      updatedAt: instant,
      workspaceId: "workspace-1",
    },
    propertyId: `property-${dataSourceId}`,
    updatedAt: instant,
    visible: true,
    width: null,
  }
}

function view(config: unknown = { initialPageSize: 10 }) {
  return {
    config,
    createdAt: instant,
    databaseId: "database-1",
    dataSourceId: "source-1",
    id: "view-1",
    name: "Default",
    position: 0,
    type: "table",
    updatedAt: instant,
  }
}

function row(position: number) {
  const number = position + 1
  return {
    createdAt: instant,
    createdById: "user-1",
    dataSourceId: "source-1",
    deletedAt: null,
    deletedById: null,
    id: `row-${number}`,
    lastEditedById: "user-1",
    orderKey: String(number * 1024),
    page: {
      createdAt: instant,
      deletedAt: null,
      hasContent: false,
      id: `page-${number}`,
      metadata: null,
      name: `Task ${String(number).padStart(2, "0")}`,
      updatedAt: instant,
    },
    pageId: `page-${number}`,
    parentRowId: null,
    position,
    updatedAt: instant,
  }
}

function value(position: number) {
  const number = position + 1
  return {
    createdAt: instant,
    id: `value-${number}`,
    pageId: `page-${number}`,
    propertyId: "property-source-1",
    updatedAt: instant,
    value: String(number),
  }
}

function payload(options: { config?: unknown; rows?: number } = {}) {
  const count = options.rows ?? 12
  return {
    activeDataSource: source(),
    dataSources: [source(), source("source-2", 1)],
    database: { ...databaseRecord(), dataSourceConfig: {}, isFavorite: false },
    properties: [property()],
    rows: Array.from({ length: count }, (_, position) => row(position)),
    values: Array.from({ length: count }, (_, position) => value(position)),
    views: [view(options.config)],
  }
}

test("bootstrap aggregates metadata for every accessible linked source", async () => {
  const base = { ...payload({ rows: 0 }), properties: [property()] }
  const second = {
    ...base,
    activeDataSource: source("source-2", 1),
    properties: [property("source-2")],
  }
  const getSchemaPayload = vi.fn(async (
    _id: string,
    _userId?: string,
    _record?: unknown,
    options?: { dataSourceId?: string },
  ) => options?.dataSourceId === "source-2" ? second : base)

  const result = await getDatabaseBootstrapService(
    {
      accessLevel: "edit",
      databaseId: "database-1",
      existingRecord: databaseRecord(),
      userId: "user-1",
      viewId: "view-1",
    },
    {
      getPayload: vi.fn(),
      getSchemaPayload,
      requireAccess: vi.fn(),
    } as never,
  )

  assert.equal(result.database.accessLevel, "edit")
  assert.deepEqual(result.dataSources.map(({ id }) => id), ["source-1", "source-2"])
  assert.deepEqual(result.properties.map(({ id }) => id), [
    "column-source-1",
    "column-source-2",
  ])
  assert.equal("rows" in result, false)
})

test("record windows use view page size, complete aggregates, and load-more offsets", async () => {
  const getPayload = vi.fn(async () => payload())
  const dependencies = {
    getPayload,
    getSchemaPayload: vi.fn(),
    requireAccess: vi.fn(),
  } as never
  const first = await getDatabaseRecordWindowService(
    {
      databaseId: "database-1",
      dataSourceId: "source-1",
      existingRecord: databaseRecord(),
      offset: 0,
      viewId: "view-1",
    },
    dependencies,
  )
  const second = await getDatabaseRecordWindowService(
    {
      databaseId: "database-1",
      dataSourceId: "source-1",
      existingRecord: databaseRecord(),
      limit: 10,
      offset: 10,
      snapshot: first.snapshot,
      viewId: "view-1",
    },
    dependencies,
  )

  assert.equal(first.records.length, 10)
  assert.equal(first.hasMore, true)
  assert.equal(first.totalCount, 12)
  assert.equal(first.records[0]?.valuesByPropertyId["property-source-1"]?.value, "1")
  assert.deepEqual(second.records.map(({ id }) => id), ["row-11", "row-12"])
  assert.equal(second.hasMore, false)
})

test("record windows apply normalized filters and formula-safe numeric sorts before slicing", async () => {
  const config = {
    filters: [{
      id: "filter-1",
      operator: "greater_than",
      propertyId: "column-source-1",
      values: ["8"],
    }],
    initialPageSize: 10,
    sorts: [{ column: "column-source-1", direction: "descending" }],
  }
  const result = await getDatabaseRecordWindowService(
    {
      databaseId: "database-1",
      dataSourceId: "source-1",
      existingRecord: databaseRecord(),
      viewId: "view-1",
    },
    {
      getPayload: vi.fn(async () => payload({ config })),
      getSchemaPayload: vi.fn(),
      requireAccess: vi.fn(),
    } as never,
  )

  assert.deepEqual(result.records.map(({ id }) => id), [
    "row-12",
    "row-11",
    "row-10",
    "row-9",
  ])
  assert.equal(result.totalCount, 4)
})

test("stale snapshots and invalid source/view windows fail with typed conflicts", async () => {
  const dependencies = {
    getPayload: vi.fn(async () => payload()),
    getSchemaPayload: vi.fn(),
    requireAccess: vi.fn(),
  } as never

  await assert.rejects(
    getDatabaseRecordWindowService(
      {
        databaseId: "database-1",
        dataSourceId: "source-1",
        existingRecord: databaseRecord(),
        snapshot: "stale",
        viewId: "view-1",
      },
      dependencies,
    ),
    (error: unknown) =>
      error instanceof DatabaseWindowStaleError &&
      error.status === 409 &&
      error.currentSnapshot.length > 0,
  )

  await assert.rejects(
    getDatabaseRecordWindowService(
      {
        databaseId: "database-1",
        dataSourceId: "source-2",
        existingRecord: databaseRecord(),
        viewId: "view-1",
      },
      dependencies,
    ),
    (error: unknown) => error instanceof ServiceMutationError && error.status === 404,
  )
})

test("record window validates offsets and supported limits", async () => {
  const dependencies = {
    getPayload: vi.fn(async () => payload()),
    getSchemaPayload: vi.fn(),
    requireAccess: vi.fn(),
  } as never

  for (const request of [{ limit: 51 }, { offset: -1 }]) {
    await assert.rejects(
      getDatabaseRecordWindowService(
        {
          databaseId: "database-1",
          dataSourceId: "source-1",
          existingRecord: databaseRecord(),
          viewId: "view-1",
          ...request,
        },
        dependencies,
      ),
      (error: unknown) => error instanceof ServiceMutationError && error.status === 400,
    )
  }
})
