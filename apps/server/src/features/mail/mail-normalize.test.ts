import assert from "node:assert/strict"
import { test } from "vitest"

import type { GmailMessage, GmailThread } from "./gmail-gateway"
import { normalizeGmailMessage, normalizeGmailThread, parseMailAddresses } from "./mail-normalize"

test("full Gmail payloads normalize text, HTML, addresses, labels, and attachment metadata", () => {
  const message = fixtureMessage("message-1", "thread-1", "101", ["INBOX", "UNREAD", "STARRED"])
  const normalized = normalizeGmailMessage(message, true)

  assert.deepEqual(normalized.from, { address: "ada@example.com", name: "Ada Lovelace" })
  assert.deepEqual(normalized.to, [
    { address: "grace@example.com", name: "Grace Hopper" },
    { address: "team@example.com", name: null },
  ])
  assert.equal(normalized.subject, "Fixture subject")
  assert.equal(normalized.bodyText, "Hello from Gmail")
  assert.equal(normalized.bodyHtml, "<p>Hello from Gmail</p>")
  assert.equal(normalized.attachments[0]?.filename, "report.pdf")
  assert.equal(normalized.attachments[0]?.attachmentId, "attachment-1")
  assert.equal(normalized.attachmentCount, 1)
  assert.equal(normalized.hasFullBody, true)
})

test("thread summaries preserve ordered messages and derive unread, starred, participants, and latest date", () => {
  const first = fixtureMessage("message-1", "thread-1", "101", ["INBOX", "UNREAD"])
  const second = fixtureMessage("message-2", "thread-1", "102", ["INBOX", "STARRED"])
  const normalized = normalizeGmailThread({ id: "thread-1", messages: [second, first] } as GmailThread)

  assert.deepEqual(normalized.summary.messageIds, ["message-1", "message-2"])
  assert.equal(normalized.summary.latestMessageId, "message-2")
  assert.equal(normalized.summary.unread, true)
  assert.equal(normalized.summary.starred, true)
  assert.equal(normalized.summary.participants[0]?.address, "ada@example.com")
})

test("address parsing does not split commas inside quoted display names", () => {
  assert.deepEqual(parseMailAddresses('"Lovelace, Ada" <ADA@example.com>, team@example.com'), [
    { address: "ada@example.com", name: "Lovelace, Ada" },
    { address: "team@example.com", name: null },
  ])
})

function fixtureMessage(
  id: string,
  threadId: string,
  internalDate: string,
  labelIds: string[],
): GmailMessage {
  return {
    historyId: "120",
    id,
    internalDate,
    labelIds,
    payload: {
      headers: [
        { name: "From", value: "Ada Lovelace <ada@example.com>" },
        { name: "To", value: "Grace Hopper <grace@example.com>, team@example.com" },
        { name: "Subject", value: "Fixture subject" },
        { name: "Message-ID", value: `<${id}@example.com>` },
      ],
      mimeType: "multipart/mixed",
      parts: [
        { body: { data: encoded("Hello from Gmail") }, mimeType: "text/plain" },
        { body: { data: encoded("<p>Hello from Gmail</p>") }, mimeType: "text/html" },
        {
          body: { attachmentId: "attachment-1", size: 42 },
          filename: "report.pdf",
          mimeType: "application/pdf",
        },
      ],
    },
    sizeEstimate: 512,
    snippet: "Hello from Gmail",
    threadId,
  }
}

function encoded(value: string) {
  return Buffer.from(value).toString("base64url")
}
