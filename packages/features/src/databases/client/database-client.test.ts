import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import {
  createDatabaseClient,
  databaseClientQueryKey,
} from "./database-client"

test("session database clients clean resources and scoped Query data", async () => {
  const queryClient = new QueryClient()
  const client = createDatabaseClient({
    apiFetch: async () => undefined as never,
    queryClient,
    sessionId: "session-1",
  })
  const cleaned: string[] = []
  client.registerCleanup(() => {
    cleaned.push("collection")
  })
  queryClient.setQueryData(
    databaseClientQueryKey("session-1", "bootstrap", "database-1"),
    { id: "database-1" },
  )
  queryClient.setQueryData(
    databaseClientQueryKey("session-2", "bootstrap", "database-1"),
    { id: "database-1" },
  )

  await client.cleanup()
  await client.cleanup()

  assert.deepEqual(cleaned, ["collection"])
  assert.equal(client.isDisposed(), true)
  assert.equal(
    queryClient.getQueryData(
      databaseClientQueryKey("session-1", "bootstrap", "database-1"),
    ),
    undefined,
  )
  assert.deepEqual(
    queryClient.getQueryData(
      databaseClientQueryKey("session-2", "bootstrap", "database-1"),
    ),
    { id: "database-1" },
  )
  assert.throws(
    () => client.bootstrap({ databaseId: "database-1" }),
    /session is disposed/,
  )
})

test("command state is scoped to the affected source, row, and cell", async () => {
  const queryClient = new QueryClient()
  const requests: Array<PromiseWithResolvers<never>> = []
  const client = createDatabaseClient({
    apiFetch: async () => {
      const request = Promise.withResolvers<never>()
      requests.push(request)
      return request.promise
    },
    queryClient,
    sessionId: "session-1",
  })
  const source = { dataSourceId: "source-1" }
  const row = { ...source, rowId: "row-1" }
  const cell = { ...row, propertyId: "property-1" }
  let notifications = 0
  const unsubscribe = client.subscribeCommandState(cell, () => {
    notifications += 1
  })

  const first = client.execute({
    command: {
      propertyId: "property-1",
      rowId: "row-1",
      type: "cell.set",
      value: "Done",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })

  assert.deepEqual(client.commandState(source), {
    error: null,
    isPending: true,
    pendingCount: 1,
  })
  assert.equal(client.commandState(row).isPending, true)
  assert.equal(client.commandState(cell).isPending, true)

  const failure = new Error("Cell write failed")
  await Promise.resolve()
  requests[0]?.reject(failure)
  await assert.rejects(first.promise, failure)
  assert.deepEqual(client.commandState(cell), {
    error: failure,
    isPending: false,
    pendingCount: 0,
  })

  const retry = client.execute({
    command: {
      propertyId: "property-1",
      rowId: "row-1",
      type: "cell.set",
      value: "Retry",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  assert.equal(client.commandState(cell).error, null)
  await Promise.resolve()
  requests[1]?.reject(failure)
  await assert.rejects(retry.promise, failure)
  assert.equal(notifications, 4)

  unsubscribe()
  await client.cleanup()
})
