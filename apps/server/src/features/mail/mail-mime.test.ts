import assert from "node:assert/strict"
import { test } from "vitest"

import { buildMailMime, MailComposeError, MAX_MAIL_ATTACHMENT_BYTES, parseMailComposeRequest } from "./mail-mime"

const base = {
  attachments: [],
  bcc: [{ address: "hidden@example.com", name: "Hidden" }],
  bodyText: "Hello from Zilobase",
  cc: [{ address: "copy@example.com", name: null }],
  clientOperationId: "operation_123456",
  inReplyTo: "<parent@example.com>",
  references: ["<root@example.com>", "<parent@example.com>"],
  subject: "Re: Héllo ✓",
  threadId: "thread_1",
  to: [{ address: "person@example.com", name: "Renée" }],
}

test("MIME generation is stable for retries, encodes Unicode, keeps Bcc private, and preserves reply threading", () => {
  const compose = parseMailComposeRequest(base, { requireRecipient: true })
  const first = buildMailMime(compose, "sender@example.com", new Date("2026-08-30T10:00:00Z"))
  const second = buildMailMime(compose, "sender@example.com", new Date("2026-08-30T10:00:00Z"))
  const raw = Buffer.from(first.raw, "base64url").toString("utf8")

  assert.equal(first.rfcMessageId, "<zilobase.operation_123456@example.com>")
  assert.equal(second.rfcMessageId, first.rfcMessageId)
  assert.match(raw, /Subject: =\?utf-8\?B\?UmU6IEjDqWxsbyDinJM=\?=/)
  assert.match(raw, /To: =\?utf-8\?B\?UmVuw6ll\?= <person@example.com>/)
  assert.match(raw, /Bcc: =\?utf-8\?B\?SGlkZGVu\?= <hidden@example.com>/)
  assert.doesNotMatch(raw.match(/^To:.*$/m)?.[0] ?? "", /hidden@example\.com/)
  assert.match(raw, /In-Reply-To: <parent@example.com>/)
  assert.match(raw, /References: <root@example.com> <parent@example.com>/)
  assert.match(raw, /Message-ID: <zilobase\.operation_123456@example\.com>/)
})

test("composition validation rejects malformed addresses and header injection", () => {
  assert.throws(
    () => parseMailComposeRequest({ ...base, subject: "Hello\r\nBcc: attacker@example.com" }, { requireRecipient: true }),
    MailComposeError,
  )
  assert.throws(
    () => parseMailComposeRequest({ ...base, to: [{ address: "not-an-address", name: null }] }, { requireRecipient: true }),
    MailComposeError,
  )
  assert.throws(
    () => parseMailComposeRequest({ ...base, bcc: [], cc: [], to: [] }, { requireRecipient: true }),
    /recipient/,
  )
  assert.doesNotThrow(() => parseMailComposeRequest({ ...base, bcc: [], cc: [], to: [] }, { requireRecipient: false }))
})

test("automation compositions support a safe sender display name and reply-to", () => {
  const compose = parseMailComposeRequest({
    ...base,
    replyTo: { address: "replies@example.com", name: "Support" },
    senderName: "Zilobase Automations",
  }, { requireRecipient: true })
  const raw = Buffer.from(
    buildMailMime(compose, "sender@example.com", new Date("2026-08-30T10:00:00Z")).raw,
    "base64url",
  ).toString("utf8")
  assert.match(raw, /From: =\?utf-8\?B\?Wmlsb2Jhc2UgQXV0b21hdGlvbnM=\?= <sender@example\.com>/)
  assert.match(raw, /Reply-To: =\?utf-8\?B\?U3VwcG9ydA==\?= <replies@example\.com>/)
  assert.throws(
    () => parseMailComposeRequest({ ...base, senderName: "Bad\r\nBcc: x@example.com" }, { requireRecipient: true }),
    MailComposeError,
  )
})

test("binary attachments are capped before MIME expansion", () => {
  const tooLarge = Buffer.alloc(MAX_MAIL_ATTACHMENT_BYTES + 1).toString("base64")
  assert.throws(
    () => parseMailComposeRequest({
      ...base,
      attachments: [{ contentBase64: tooLarge, filename: "large.bin", mimeType: "application/octet-stream" }],
    }, { requireRecipient: true }),
    /20 MB/,
  )
})
