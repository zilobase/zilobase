import assert from "node:assert/strict"
import test from "node:test"

import {
  databaseBootstrapResponseSchema,
  databaseCommandAckSchema,
  databaseCommandRequestSchema,
  databaseMutationEventV2Schema,
  databaseMutationFeedResponseSchema,
  databaseProtocolErrorSchema,
  databaseRecordWindowResponseSchema,
  moveRowCommandSchema,
} from  "./entities"

const now = "2026-09-14T10:00:00.000Z"

const host = {
  accessLevel: "edit" as const,
  config: {},
  createdAt: now,
  id: "database-1",
  name: "Tasks",
  pageId: "page-host",
  updatedAt: now,
  version: 4,
  workspaceId: "workspace-1",
}

const record = {
  createdAt: now,
  dataSourceId: "source-1",
  id: "row-1",
  orderKey: "1024",
  page: {
    createdAt: now,
    deletedAt: null,
    hasContent: false,
    id: "page-1",
    metadata: {},
    name: "First",
    updatedAt: now,
  },
  pageId: "page-1",
  parentRowId: null,
  updatedAt: now,
  valuesByPropertyId: {},
}

const event = {
  actorId: "user-1",
  areas: ["records" as const],
  changes: { records: [record] },
  commandId: "command-1",
  committedAt: now,
  databaseId: "database-1",
  dataSourceId: "source-1",
  eventId: "event-5",
  protocolVersion: 2 as const,
  type: "database.mutation" as const,
  version: 5,
}

test("v2 bootstrap excludes monolithic row fields", () => {
  const parsed = databaseBootstrapResponseSchema.parse({
    database: host,
    dataSources: [],
    properties: [],
    views: [],
  })

  assert.equal(parsed.database.id, "database-1")
  assert.equal(
    databaseBootstrapResponseSchema.safeParse({ ...parsed, rows: [] }).success,
    false,
  )
})

test("record windows require complete atomic records and snapshot versions", () => {
  const parsed = databaseRecordWindowResponseSchema.parse({
    databaseVersion: 5,
    dataSourceVersion: 8,
    hasMore: false,
    offset: 0,
    records: [record],
    snapshot: "snapshot-token",
    totalCount: 1,
  })

  assert.equal(parsed.records[0]?.page.hasContent, false)
  assert.equal(
    databaseRecordWindowResponseSchema.safeParse({
      ...parsed,
      records: [{ ...record, page: undefined }],
    }).success,
    false,
  )
})

test("row movement uses anchors and rejects legacy row id arrays", () => {
  assert.deepEqual(
    moveRowCommandSchema.parse({
      afterRowId: "row-3",
      beforeRowId: "row-2",
      rowId: "row-1",
      type: "row.move",
    }),
    {
      afterRowId: "row-3",
      beforeRowId: "row-2",
      rowId: "row-1",
      type: "row.move",
    },
  )
  assert.equal(
    moveRowCommandSchema.safeParse({
      afterRowId: null,
      beforeRowId: null,
      rowId: "row-1",
      rowIds: ["row-1"],
      type: "row.move",
    }).success,
    false,
  )
})

test("command requests are protocol-versioned discriminated unions", () => {
  assert.equal(
    databaseCommandRequestSchema.parse({
      command: {
        propertyId: "property-1",
        rowId: "row-1",
        type: "cell.set",
        value: "Done",
      },
      commandId: "command-1",
      protocolVersion: 2,
    }).command.type,
    "cell.set",
  )
  assert.equal(
    databaseCommandRequestSchema.safeParse({
      command: { type: "unknown" },
      commandId: "command-1",
      protocolVersion: 2,
    }).success,
    false,
  )
})

test("events and acknowledgements require complete v2 entity changes", () => {
  assert.equal(databaseMutationEventV2Schema.parse(event).eventId, "event-5")
  assert.equal(
    databaseMutationEventV2Schema.safeParse({
      ...event,
      changes: { records: [{ id: "row-1" }] },
    }).success,
    false,
  )
  assert.equal(
    databaseCommandAckSchema.parse({
      commandId: "command-1",
      event,
      result: { record },
    }).commandId,
    "command-1",
  )
})

test("mutation feeds expose ordered catch-up state", () => {
  assert.equal(databaseMutationFeedResponseSchema.parse({
    events: [event],
    hasMore: false,
    latestVersion: 5,
    resetRequired: false,
  }).events[0]?.version, 5)
})

test("typed protocol errors preserve conflict-specific context", () => {
  assert.deepEqual(
    databaseProtocolErrorSchema.parse({
      code: "ROW_MOVE_CONFLICT",
      message: "The row anchors are no longer valid.",
      rowId: "row-1",
    }),
    {
      code: "ROW_MOVE_CONFLICT",
      message: "The row anchors are no longer valid.",
      rowId: "row-1",
    },
  )
})
