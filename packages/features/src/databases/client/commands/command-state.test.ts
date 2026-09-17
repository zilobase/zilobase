import assert from "node:assert/strict"
import test from "node:test"
import { DatabaseCommandStateStore } from "./command-state"
import { guardPendingDatabaseWrites } from "./pending-navigation"
import { createDatabaseClient } from "../db-client"
import { QueryClient } from "@tanstack/react-query"

function cell(propertyId: string) {
  return {
    databaseId: "host", dataSourceId: "source",
    command: { type: "cell.set" as const, rowId: "row", propertyId, value: "Done" },
  }
}

test("global and host status include cell writes and retain unrelated failures", async () => {
  const store = new DatabaseCommandStateStore()
  const first = Promise.withResolvers<void>()
  const second = Promise.withResolvers<void>()
  const firstResult = store.track(cell("first"), first.promise)
  const secondResult = store.track(cell("second"), second.promise)
  assert.equal(store.get({}).pendingCount, 2)
  assert.equal(store.get({ hostDatabaseId: "host" }).pendingCount, 2)
  const failure = new Error("Save failed")
  first.reject(failure)
  await assert.rejects(firstResult, failure)
  second.resolve()
  await secondResult
  assert.equal(store.get({ hostDatabaseId: "host" }).error, failure)
  assert.equal(store.get({}).isPending, false)
  await store.track(cell("first"), Promise.resolve())
  assert.equal(store.get({}).error, null)
})

test("reload is guarded while a command is pending and released after failure", async (t) => {
  const request = Promise.withResolvers<never>()
  const client = createDatabaseClient({
    apiFetch: () => request.promise, queryClient: new QueryClient(), sessionId: "session",
  })
  t.after(() => client.cleanup())
  const target = new EventTarget()
  const unguard = guardPendingDatabaseWrites(client, target as Window)
  t.after(unguard)
  const before = new Event("beforeunload", { cancelable: true })
  target.dispatchEvent(before)
  assert.equal(before.defaultPrevented, false)
  const write = client.execute(cell("first"))
  const during = new Event("beforeunload", { cancelable: true })
  target.dispatchEvent(during)
  assert.equal(during.defaultPrevented, true)
  request.reject(new Error("Save failed"))
  await assert.rejects(write.promise)
  const after = new Event("beforeunload", { cancelable: true })
  target.dispatchEvent(after)
  assert.equal(after.defaultPrevented, false)
})
