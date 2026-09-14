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
