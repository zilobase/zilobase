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
