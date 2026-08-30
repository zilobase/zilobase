import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import { GmailPushError, parsePubsubEnvelope } from "./gmail-pubsub"

test("Pub/Sub envelopes require the exact subscription and valid Gmail data", () => {
  const data = Buffer.from(JSON.stringify({
    emailAddress: "Person@Example.com",
    historyId: "123456789",
  })).toString("base64")
  const envelope = JSON.stringify({
    message: { data, messageId: "push-1" },
    subscription: "projects/example/subscriptions/gmail",
  })

  assert.deepEqual(parsePubsubEnvelope(envelope, "projects/example/subscriptions/gmail"), {
    emailAddress: "person@example.com",
    historyId: "123456789",
  })
  assert.throws(
    () => parsePubsubEnvelope(envelope, "projects/example/subscriptions/other"),
    (error: unknown) => error instanceof GmailPushError && error.status === 403,
  )
})

test("Pub/Sub envelopes reject malformed base64, oversized IDs, and missing message IDs", () => {
  assert.throws(
    () => parsePubsubEnvelope(JSON.stringify({
      message: { data: "%%%" },
      subscription: "subscription",
    }), "subscription"),
    GmailPushError,
  )
  const data = Buffer.from(JSON.stringify({ emailAddress: "a@example.com", historyId: "1".repeat(33) })).toString("base64")
  assert.throws(
    () => parsePubsubEnvelope(JSON.stringify({ message: { data, messageId: "1" }, subscription: "subscription" }), "subscription"),
    GmailPushError,
  )
})

test("Pub/Sub revision advancement is one atomic newer-history update", async () => {
  const source = await readFile(new URL("./gmail-pubsub.ts", import.meta.url), "utf8")
  assert.match(source, /return runWithDbEnv\(env, async \(\) =>/)
  assert.match(source, /mailboxRevision:\s*sql`\$\{gmailConnection\.mailboxRevision\} \+ 1`/)
  assert.match(source, /notificationHistoryId\}::numeric < \$\{notification\.historyId\}::numeric/)
  assert.doesNotMatch(source, /subject|snippet|bodyHtml|bodyText/)
})
