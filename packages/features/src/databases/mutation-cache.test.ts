import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import { applyMutationToCache } from "./mutation-cache"
import { databaseQueryKey } from "./queries"
import { createTestDatabasePayload } from "./test-helpers"

function valueMutation(version: number, value: unknown) {
  return {
    changed: ["values" as const],
    committedAt: "2026-07-14T12:00:00.000Z",
    databaseId: "database-1",
    delta: {
      values: [{
        pageId: "page-1",
        propertyId: "property-status",
        updatedAt: "2026-07-14T12:00:00.000Z",
        value,
      }],
    },
    mutationId: `mutation-${version}`,
    version,
  }
}

test("an older HTTP mutation response cannot overwrite newer realtime state", () => {
  const queryClient = new QueryClient()
  const key = databaseQueryKey("database-1")
  const initial = createTestDatabasePayload()
  initial.database.version = 3
  queryClient.setQueryData(key, initial)

  applyMutationToCache(queryClient, "database-1", valueMutation(4, "Done"))
  applyMutationToCache(
    queryClient,
    "database-1",
    valueMutation(3, "Not started"),
  )

  const payload = queryClient.getQueryData<ReturnType<
    typeof createTestDatabasePayload
  >>(key)
  assert.equal(payload?.database.version, 4)
  assert.equal(payload?.values[0]?.value, "Done")
})

test("row and value deltas do not populate schema-only caches", () => {
  const queryClient = new QueryClient()
  const fullKey = databaseQueryKey("database-1")
  const schemaKey = databaseQueryKey("database-1", { schemaOnly: true })
  const full = createTestDatabasePayload()
  const schema = createTestDatabasePayload({ rows: [], values: [] })
  queryClient.setQueryData(fullKey, full)
  queryClient.setQueryData(schemaKey, schema)

  applyMutationToCache(queryClient, "database-1", {
    changed: ["rows", "values"],
    committedAt: "2026-07-14T12:00:00.000Z",
    databaseId: "database-1",
    delta: {
      rows: [{
        createdAt: "2026-07-14T12:00:00.000Z",
        databaseId: "database-1",
        id: "row-3",
        page: { id: "page-3", name: "Gamma" },
        pageId: "page-3",
        position: 2,
        updatedAt: "2026-07-14T12:00:00.000Z",
      }],
      values: [{
        pageId: "page-3",
        propertyId: "property-status",
        updatedAt: "2026-07-14T12:00:00.000Z",
        value: "Not started",
      }],
    },
    mutationId: "mutation-1",
    version: 1,
  })

  const nextFull = queryClient.getQueryData<ReturnType<
    typeof createTestDatabasePayload
  >>(fullKey)
  const nextSchema = queryClient.getQueryData<ReturnType<
    typeof createTestDatabasePayload
  >>(schemaKey)
  assert.equal(nextFull?.rows.length, 3)
  assert.equal(nextSchema?.rows.length, 0)
  assert.equal(nextSchema?.values.length, 0)
  assert.equal(nextSchema?.database.version, 1)
})

test("invalidate-only mutations refetch without advancing cached versions", () => {
  const queryClient = new QueryClient()
  const key = databaseQueryKey("database-1")
  const initial = createTestDatabasePayload()
  initial.database.version = 3
  queryClient.setQueryData(key, initial)

  const result = applyMutationToCache(queryClient, "database-1", {
    changed: ["values"],
    committedAt: "2026-07-14T12:00:00.000Z",
    databaseId: "database-1",
    delta: {},
    mutationId: "mutation-4",
    requiresRefetch: true,
    version: 4,
  })

  assert.equal(result?.database.version, 3)
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true)
})
