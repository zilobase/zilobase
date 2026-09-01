import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import { mailDatabaseSyncBackoffMs } from "./mail-database-sync-worker"

test("database sync retry backoff grows exponentially and is bounded", () => {
  assert.equal(mailDatabaseSyncBackoffMs(1), 5_000)
  assert.equal(mailDatabaseSyncBackoffMs(2), 10_000)
  assert.equal(mailDatabaseSyncBackoffMs(8), 640_000)
  assert.equal(mailDatabaseSyncBackoffMs(100), 3_600_000)
})

test("database sync enqueues each view and thread idempotently after activation", async () => {
  const [worker, schema, migration] = await Promise.all([
    readFile(new URL("./mail-database-sync-worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../../infrastructure/database/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../drizzle/0071_mail_database_sync.sql", import.meta.url), "utf8"),
  ])
  assert.match(worker, /row\.internalDate <= activatedAt/)
  assert.match(worker, /existingViewIds\.has\(candidate\.viewId\)/)
  assert.match(worker, /evaluateMailFilterExpression/)
  assert.match(worker, /onConflictDoUpdate\(\{\s*target: \[mailDatabaseSyncOutbox\.viewId, mailDatabaseSyncOutbox\.gmailThreadId\]/)
  assert.match(schema, /mail_database_sync_outbox_view_thread_unique/)
  assert.match(migration, /mail_database_sync_outbox_view_thread_unique/)
})

test("database sync worker leases jobs, retries failures, and pauses inaccessible destinations", async () => {
  const worker = await readFile(new URL("./mail-database-sync-worker.ts", import.meta.url), "utf8")
  assert.match(worker, /const LEASE_MS = 2 \* 60 \* 1_000/)
  assert.match(worker, /const MAX_ATTEMPTS = 8/)
  assert.match(worker, /leaseExpiresAt/)
  assert.match(worker, /mailDatabaseSyncBackoffMs\(attempts\)/)
  assert.match(worker, /MailDatabaseSyncPausedError\("The destination is no longer accessible\."\)/)
  assert.match(worker, /eq\(mailDatabaseSyncOutbox\.sourceUpdatedAt, claimed\.sourceUpdatedAt\)/)
})

test("database sync remains same-workspace, explicit, and non-destructive", async () => {
  const worker = await readFile(new URL("./mail-database-sync-worker.ts", import.meta.url), "utf8")
  assert.match(worker, /requireDatabaseEditAccess/)
  assert.match(worker, /requireDataSourceEditAccess/)
  assert.match(worker, /databaseRecord\.workspaceId !== job\.binding\.workspaceId/)
  assert.match(worker, /config\.databaseSync\.mappings\.some\(\(mapping\) => mapping\.sourcePropertyId === "attachments"\)/)
  assert.match(worker, /destinationPropertyId === "title"/)
  assert.match(worker, /tx\.update\(page\)\.set\(\{ name:/)
  assert.match(worker, /tx\.insert\(pagePropertyValue\)/)
  assert.doesNotMatch(worker, /delete\(pagePropertyValue\)/)
  assert.doesNotMatch(worker, /update\(page\)\.set\(\{[^}]*content:/s)
})

test("database sync is wired to index, custom-property, route, and runtime paths", async () => {
  const [index, properties, routes, runtime, adapter] = await Promise.all([
    readFile(new URL("./mail-index.ts", import.meta.url), "utf8"),
    readFile(new URL("./mail-properties.ts", import.meta.url), "utf8"),
    readFile(new URL("./routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/node/node-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../../public/adapter-api.ts", import.meta.url), "utf8"),
  ])
  assert.match(index, /enqueueMailDatabaseSyncForIndexedThread\(row\)/)
  assert.match(properties, /enqueueMailDatabaseSyncForThread\(input\.gmailAccountId, input\.threadId\)/)
  assert.match(routes, /drainMailDatabaseSyncOutbox\(c\.env, \{ bindingId: owned\.bindingId, limit: 10 \}\)/)
  assert.match(routes, /database-sync-status/)
  assert.match(runtime, /drainMailDatabaseSyncOutbox\(env, \{ limit: 50 \}\)/)
  assert.match(adapter, /drainMailDatabaseSyncOutbox/)
})
