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

test("mail views are private to a workspace binding and cascade on disconnect", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0067_private_mail_views.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /CREATE TABLE "mail_view"/)
  assert.match(migration, /"binding_id" text NOT NULL/)
  assert.match(migration, /REFERENCES "public"\."gmail_workspace_connection"\("id"\) ON DELETE cascade/)
  assert.match(migration, /mail_view_binding_position_idx/)
  assert.doesNotMatch(migration, /message_body|body_html|body_text/)
})

test("full-mailbox index stores queryable metadata without message content", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0068_full_mailbox_metadata_index.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /CREATE TABLE "mail_index_state"/)
  assert.match(migration, /CREATE TABLE "mail_thread_index"/)
  assert.match(migration, /"history_page_token" text/)
  assert.match(migration, /"next_page_token" text/)
  assert.match(migration, /mail_thread_index_account_thread_unique/)
  assert.match(migration, /ON DELETE cascade/)
  assert.doesNotMatch(migration, /snippet|body_html|body_text|raw_message/)
})

test("custom mail properties are binding-wide and thread values cascade with definitions", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0069_custom_mail_properties.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /CREATE TABLE "mail_property"/)
  assert.match(migration, /CREATE TABLE "mail_thread_property_value"/)
  assert.match(migration, /mail_property_binding_id_gmail_workspace_connection_id_fk/)
  assert.match(migration, /mail_thread_property_value_property_thread_unique/)
  assert.match(migration, /'text', 'number', 'select', 'multi_select', 'status', 'date', 'person', 'checkbox', 'url', 'files'/)
  assert.doesNotMatch(migration, /workspace_id.*mail_thread_property_value/)
})

test("workspace rollout removes legacy credentials and requires workspace OAuth state", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0072_workspace_mail_rollout.sql", import.meta.url),
    "utf8",
  )

  assert.match(migration, /DELETE FROM "gmail_oauth_attempt" WHERE "workspace_id" IS NULL/)
  assert.match(migration, /ALTER COLUMN "workspace_id" SET NOT NULL/)
  assert.match(migration, /DROP TABLE "gmail_connection"/)
})
