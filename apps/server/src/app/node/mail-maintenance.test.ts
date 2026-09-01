import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

test("Node maintenance renews Gmail watches", async () => {
  const runtime = await readFile(new URL("./node-runtime.ts", import.meta.url), "utf8")
  assert.match(runtime, /renewGmailWatches\(env\)/)
})

test("Node maintenance advances bounded full-mailbox index work", async () => {
  const runtime = await readFile(new URL("./node-runtime.ts", import.meta.url), "utf8")
  assert.match(runtime, /advancePendingMailIndexes\(env\)/)
})

test("Node maintenance drains database synchronization work", async () => {
  const runtime = await readFile(new URL("./node-runtime.ts", import.meta.url), "utf8")
  assert.match(runtime, /drainMailDatabaseSyncOutbox\(env, \{ limit: 50 \}\)/)
})
