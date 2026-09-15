import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { getTableColumns, getTableName } from "drizzle-orm"
import { test } from "vitest"

import {
  databaseCommandReceipt,
  databaseMutationEvent,
  databaseRealtimeOutbox,
  databaseRow,
} from "../../infrastructure/database/schema"

test("database v2 schema requires canonical row order and journal-backed delivery", () => {
  const rowColumns = getTableColumns(databaseRow)
  const outboxColumns = getTableColumns(databaseRealtimeOutbox)

  assert.equal(rowColumns.orderKey?.notNull, true)
  assert.equal("position" in rowColumns, false)
  assert.equal(getTableName(databaseMutationEvent), "database_mutation_event")
  assert.equal(getTableName(databaseCommandReceipt), "database_command_receipt")
  assert.equal(outboxColumns.eventId?.notNull, true)
  assert.equal("delta" in outboxColumns, false)
  assert.equal("databaseId" in outboxColumns, false)
})

test("outbox migration references journal events while retaining pre-journal rows", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0091_database_outbox_journal_reference.sql", import.meta.url),
    "utf8",
  )
  assert.match(migration, /ADD COLUMN "event_id" text/)
  assert.match(migration, /SET "event_id" = event\."id"/)
  assert.match(migration, /REFERENCES "public"\."database_mutation_event"\("id"\)/)
  assert.match(migration, /ON DELETE restrict/)
})

test("database v2 migration backfills order keys and indexes recovery paths", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0090_database_mutation_journal.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /"order_key" numeric\(30, 10\)/)
  assert.match(migration, /\("position"::numeric \+ 1\) \* 1024/)
  assert.match(migration, /database_row_source_order_idx/)
  assert.match(migration, /CREATE TABLE "database_mutation_event"/)
  assert.match(migration, /database_mutation_event_database_version_unique/)
  assert.match(migration, /database_mutation_event_retention_idx/)
  assert.match(migration, /CREATE TABLE "database_command_receipt"/)
  assert.match(migration, /database_command_receipt_retention_idx/)
})

test("database v2 finalization removes compatibility columns and enforces order", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0092_database_v2_constraints.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /row_number\(\) OVER/)
  assert.match(migration, /ALTER COLUMN "order_key" SET NOT NULL/)
  assert.match(migration, /database_row_source_order_unique/)
  assert.match(migration, /DROP COLUMN "position"/)
  assert.match(migration, /DELETE FROM "database_realtime_outbox" WHERE "event_id" IS NULL/)
  assert.match(migration, /ALTER COLUMN "event_id" SET NOT NULL/)
  assert.match(migration, /DROP COLUMN "delta"/)
  assert.doesNotMatch(migration, /page_item_placement.*DROP COLUMN/is)
})
