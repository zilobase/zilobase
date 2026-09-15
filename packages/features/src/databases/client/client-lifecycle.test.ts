import assert from "node:assert/strict"
import test from "node:test"

import { retainDatabaseClient } from "./client-lifecycle"

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0))

test("Strict Mode effect replay does not dispose a reacquired database client", async () => {
  let cleanups = 0
  const client = { cleanup: () => { cleanups += 1 } }

  const firstRelease = retainDatabaseClient(client)
  firstRelease()
  const finalRelease = retainDatabaseClient(client)
  await nextTask()
  assert.equal(cleanups, 0)

  finalRelease()
  await nextTask()
  assert.equal(cleanups, 1)
})

test("replacing a database client still disposes the previous instance", async () => {
  let oldCleanups = 0
  let newCleanups = 0
  const oldClient = { cleanup: () => { oldCleanups += 1 } }
  const newClient = { cleanup: () => { newCleanups += 1 } }

  retainDatabaseClient(oldClient)()
  const releaseNew = retainDatabaseClient(newClient)
  await nextTask()
  assert.equal(oldCleanups, 1)
  assert.equal(newCleanups, 0)

  releaseNew()
  await nextTask()
  assert.equal(newCleanups, 1)
})
