import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

test("Gmail persistence stores credentials and control metadata only", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0061_gmail_connections.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /CREATE TABLE "gmail_connection"/)
  assert.match(migration, /CREATE TABLE "gmail_oauth_attempt"/)
  assert.match(migration, /gmail_connection_user_unique/)
  assert.match(migration, /gmail_oauth_attempt_state_unique/)
  assert.match(migration, /refresh_token_ciphertext/)
  assert.match(migration, /notification_history_id/)
  assert.doesNotMatch(
    migration,
    /message_body|body_html|body_text|message_subject|message_sender|message_recipient/,
  )
})

test("Gmail send receipts contain deduplication metadata but no mail content", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0063_gmail_send_operations.sql", import.meta.url),
    "utf8",
  )
  assert.match(migration, /CREATE TABLE "gmail_send_operation"/)
  assert.match(migration, /rfc_message_id/)
  assert.match(migration, /gmail_message_id/)
  assert.match(migration, /expires_at/)
  assert.doesNotMatch(migration, /body|subject|sender|recipient|attachment/)
})

test("workspace Gmail storage separates reusable accounts from private bindings", async () => {
  const migration = await readFile(
    new URL(
      "../../../drizzle/0065_workspace_gmail_connections.sql",
      import.meta.url,
    ),
    "utf8",
  )

  assert.match(migration, /CREATE TABLE "gmail_account"/)
  assert.match(migration, /CREATE TABLE "gmail_workspace_connection"/)
  assert.match(migration, /gmail_account_owner_subject_unique/)
  assert.match(migration, /gmail_workspace_connection_workspace_user_unique/)
  assert.match(migration, /gmail_workspace_connection_member_fk/)
  assert.match(migration, /gmail_workspace_connection_account_owner_fk/)
})

test("legacy Gmail credentials become unbound reconnect-required accounts", async () => {
  const migration = await readFile(
    new URL(
      "../../../drizzle/0065_workspace_gmail_connections.sql",
      import.meta.url,
    ),
    "utf8",
  )

  assert.match(
    migration,
    /INSERT INTO "gmail_account"[\s\S]*'reconnect_required'/,
  )
  assert.match(migration, /'legacy_reconnect_required'/)
  assert.doesNotMatch(
    migration,
    /INSERT INTO "gmail_workspace_connection"/,
  )
})

test("workspace OAuth state and send receipts reference reusable Gmail accounts", async () => {
  const migration = await readFile(
    new URL(
      "../../../drizzle/0066_workspace_gmail_oauth.sql",
      import.meta.url,
    ),
    "utf8",
  )

  assert.match(migration, /gmail_oauth_attempt[\s\S]*workspace_id/)
  assert.match(migration, /gmail_oauth_attempt_workspace_id_workspace_id_fk/)
  assert.match(
    migration,
    /gmail_send_operation_connection_id_gmail_account_id_fk/,
  )
  assert.doesNotMatch(
    migration,
    /gmail_send_operation_connection_id_gmail_connection_id_fk" FOREIGN KEY/,
  )
})
