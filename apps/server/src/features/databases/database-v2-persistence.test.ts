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

test("database v2 schema exposes nullable row order and durable journals", () => {
  const rowColumns = getTableColumns(databaseRow)

  assert.equal(rowColumns.orderKey?.notNull, false)
  assert.equal(getTableName(databaseMutationEvent), "database_mutation_event")
  assert.equal(getTableName(databaseCommandReceipt), "database_command_receipt")
  assert.equal(getTableColumns(databaseRealtimeOutbox).eventId?.notNull, false)
})

test("outbox migration references journal events while retaining legacy rows", async () => {
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
