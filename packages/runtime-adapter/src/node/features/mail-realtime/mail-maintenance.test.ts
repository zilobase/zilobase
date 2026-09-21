import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { test } from "vitest"

const require = createRequire(import.meta.url)
const maintenancePath = path.join(
  path.dirname(path.dirname(require.resolve("@zilobase/server/adapter-api"))),
  "app/background/maintenance.ts",
)

test("Node maintenance renews Gmail watches", async () => {
  const runtime = await readFile(maintenancePath, "utf8")
  assert.match(runtime, /renewGmailWatches\(env\)/)
})

test("Node maintenance advances bounded full-mailbox index work", async () => {
  const runtime = await readFile(maintenancePath, "utf8")
  assert.match(runtime, /advancePendingMailIndexes\(env\)/)
})

test("Node maintenance drains database synchronization work", async () => {
  const runtime = await readFile(new URL("../../background-coordinator.ts", import.meta.url), "utf8")
  assert.match(runtime, /drainMailDatabaseSyncOutbox\(env/)
})
