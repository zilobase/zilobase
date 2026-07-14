import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import {
  applyDatabaseRealtimeMutation,
  createCellPresenceByKey,
  reconnectDelay,
  samePresence,
  type DatabasePresenceCollaborator,
} from "./realtime"
import { databaseQueryKey } from "./queries"
import { createTestDatabasePayload } from "./test-helpers"

const mutation = (version: number, value: unknown) => ({
  actorId: "user-2",
  changed: ["values" as const],
  committedAt: "2026-07-14T12:00:00.000Z",
  databaseId: "database-1",
  delta: {
    values: [{
      propertyId: "property-status",
      updatedAt: "2026-07-14T12:00:00.000Z",
      value,
      pageId: "page-1",
    }],
  },
  mutationId: `mutation-${version}`,
  protocolVersion: 1 as const,
  type: "database.mutation" as const,
  version,
})

test("realtime applies exactly the next database version", () => {
  const queryClient = new QueryClient()
  const key = databaseQueryKey("database-1")
  const initial = createTestDatabasePayload()
  initial.database.version = 3
  queryClient.setQueryData(key, initial)

  const result = applyDatabaseRealtimeMutation(
    queryClient,
    mutation(4, "Done"),
  )
  const payload = queryClient.getQueryData<ReturnType<typeof createTestDatabasePayload>>(key)

  assert.equal(result.gapDetected, false)
  assert.equal(payload?.database.version, 4)
  assert.equal(payload?.values[0]?.value, "Done")
})

test("realtime ignores duplicates and invalidates on a version gap", () => {
  const queryClient = new QueryClient()
  const key = databaseQueryKey("database-1")
  const initial = createTestDatabasePayload()
  initial.database.version = 3
  queryClient.setQueryData(key, initial)

  applyDatabaseRealtimeMutation(queryClient, mutation(3, "Duplicate"))
  const result = applyDatabaseRealtimeMutation(
    queryClient,
    mutation(5, "Skipped"),
  )
  const payload = queryClient.getQueryData<ReturnType<typeof createTestDatabasePayload>>(key)

  assert.equal(result.gapDetected, true)
  assert.equal(payload?.database.version, 3)
  assert.equal(payload?.values[0]?.value, "Not started")
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
})

test("cell presence deduplicates the same user within a cell", () => {
  const collaborator = (
    sessionId: string,
    rowId = "row-1",
  ): DatabasePresenceCollaborator => ({
    color: "#2563eb",
    connectedAt: "2026-07-14T12:00:00.000Z",
    presence: { columnKey: "property-status", rowId, viewId: "view-1" },
    sessionId,
    updatedAt: "2026-07-14T12:00:00.000Z",
    user: { id: "user-2", name: "User Two" },
  })
  const result = createCellPresenceByKey([
    collaborator("session-1"),
    collaborator("session-2"),
    collaborator("session-3", "row-2"),
  ])

  assert.equal(result["row-1:property-status"]?.length, 1)
  assert.equal(result["row-2:property-status"]?.length, 1)
})

test("presence equality is based on stable cell fields", () => {
  assert.equal(
    samePresence(
      { columnKey: "status", rowId: "row-1", viewId: "view-1" },
      { columnKey: "status", rowId: "row-1", viewId: "view-1" },
    ),
    true,
  )
  assert.equal(
    samePresence(
      { columnKey: "status", rowId: "row-1", viewId: "view-1" },
      { columnKey: "status", rowId: "row-2", viewId: "view-1" },
    ),
    false,
  )
  assert.equal(samePresence(null, null), true)
})

test("reconnects use capped full jitter", () => {
  assert.equal(reconnectDelay(0, () => 0.5), 250)
  assert.equal(reconnectDelay(20, () => 0.5), 15_000)
  assert.equal(reconnectDelay(20, () => 1), 30_000)
})
