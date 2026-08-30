import type { MailAddress, MailComposeRequest } from "@zilobase/features/mail"
import { createMimeMessage } from "mimetext/browser"

export const MAX_MAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024

export class MailComposeError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = "MailComposeError"
  }
}

export function parseMailComposeRequest(value: unknown, options: { requireRecipient: boolean }): MailComposeRequest {
  if (!value || typeof value !== "object") throw new MailComposeError("A valid mail composition is required.")
  const input = value as Record<string, unknown>
  const to = parseAddresses(input.to)
  const cc = parseAddresses(input.cc)
  const bcc = parseAddresses(input.bcc)
  if (options.requireRecipient && to.length + cc.length + bcc.length === 0) {
    throw new MailComposeError("Add at least one recipient before sending.")
  }
  const subject = safeHeader(input.subject, "subject", 998)
  const bodyText = typeof input.bodyText === "string" && input.bodyText.length <= 5_000_000
    ? input.bodyText
    : null
  if (bodyText === null) throw new MailComposeError("The message body is invalid.")
  const clientOperationId = typeof input.clientOperationId === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(input.clientOperationId)
    ? input.clientOperationId
    : null
  if (!clientOperationId) throw new MailComposeError("A valid client operation ID is required.")
  const attachments = parseAttachments(input.attachments)
  const threadId = optionalGmailId(input.threadId)
  const draftId = optionalGmailId(input.draftId)
  const inReplyTo = optionalMessageId(input.inReplyTo)
  const references = input.references === undefined
    ? undefined
    : Array.isArray(input.references) && input.references.length <= 100
      ? input.references.map((value) => requiredMessageId(value))
      : fail("The References header is invalid.")
  return {
    attachments,
    bcc,
    bodyText,
    cc,
    clientOperationId,
    ...(draftId ? { draftId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {}),
    subject,
    ...(threadId ? { threadId } : {}),
    to,
  }
}

export function buildMailMime(input: MailComposeRequest, senderEmail: string, date = new Date()) {
  const sender = parseAddress({ address: senderEmail, name: null })
  const rfcMessageId = `<zilobase.${input.clientOperationId}@${sender.address.split("@")[1]}>`
  const message = createMimeMessage()
  message.setSender({ addr: sender.address })
  if (input.to.length) message.setTo(input.to.map(mailbox))
  if (input.cc.length) message.setCc(input.cc.map(mailbox))
  if (input.bcc.length) message.setBcc(input.bcc.map(mailbox))
  message.setSubject(input.subject)
  message.setHeader("Date", date.toUTCString().replace(/GMT|UTC/gi, "+0000"))
  message.setHeader("Message-ID", rfcMessageId)
  if (input.inReplyTo) message.setHeader("In-Reply-To", input.inReplyTo)
  if (input.references?.length) message.setHeader("References", input.references.join(" "))
  message.addMessage({ contentType: "text/plain", data: input.bodyText, encoding: "8bit" })
  for (const attachment of input.attachments) {
    message.addAttachment({
      contentType: attachment.mimeType,
      data: attachment.contentBase64,
      encoding: "base64",
      filename: attachment.filename,
    })
  }
  return { raw: message.asEncoded(), rfcMessageId }
}

function parseAddresses(value: unknown): MailAddress[] {
  if (!Array.isArray(value) || value.length > 500) throw new MailComposeError("The recipient list is invalid.")
  return value.map(parseAddress)
}

function parseAddress(value: unknown): MailAddress {
  if (!value || typeof value !== "object") throw new MailComposeError("A recipient address is invalid.")
  const candidate = value as Record<string, unknown>
  const address = typeof candidate.address === "string" ? candidate.address.trim().toLowerCase() : ""
  const name = candidate.name === null || candidate.name === undefined
    ? null
    : safeHeader(candidate.name, "recipient name", 200)
  if (
    address.length > 320 ||
    /[\r\n\0]/.test(address) ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(address)
  ) throw new MailComposeError("A recipient address is invalid.")
  return { address, name }
}

function parseAttachments(value: unknown): MailComposeRequest["attachments"] {
  if (!Array.isArray(value) || value.length > 100) throw new MailComposeError("The attachment list is invalid.")
  let total = 0
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new MailComposeError("An attachment is invalid.")
    const item = candidate as Record<string, unknown>
    const filename = safeHeader(item.filename, "attachment filename", 255)
    if (!filename || /["\\]/.test(filename)) throw new MailComposeError("An attachment filename is invalid.")
    const mimeType = typeof item.mimeType === "string" && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(item.mimeType)
      ? item.mimeType
      : null
    const contentBase64 = typeof item.contentBase64 === "string" ? item.contentBase64 : ""
    if (!mimeType || !isCanonicalBase64(contentBase64)) throw new MailComposeError("An attachment is invalid.")
    total += decodedBase64Length(contentBase64)
    if (total > MAX_MAIL_ATTACHMENT_BYTES) throw new MailComposeError("Attachments must total 20 MB or less.")
    return { contentBase64, filename, mimeType }
  })
}

function mailbox(address: MailAddress) {
  return { addr: address.address, ...(address.name ? { name: address.name } : {}) }
}

function safeHeader(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength || /[\r\n\0]/.test(value)) {
    throw new MailComposeError(`The ${label} is invalid.`)
  }
  return value
}

function optionalGmailId(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw new MailComposeError("A Gmail identifier is invalid.")
  }
  return value
}

function optionalMessageId(value: unknown) {
  return value === undefined ? undefined : requiredMessageId(value)
}

function requiredMessageId(value: unknown) {
  if (typeof value !== "string" || value.length > 998 || /[\r\n\0\s]/.test(value) || !/^<[^<>]+>$/.test(value)) {
    throw new MailComposeError("A mail threading header is invalid.")
  }
  return value
}

function isCanonicalBase64(value: string) {
  if (value.length % 4 !== 0) return false
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0
  const content = padding ? value.slice(0, -padding) : value
  return /^[A-Za-z0-9+/]*$/.test(content) && !content.includes("=") && (padding === 0 || content.length % 4 === 4 - padding)
}

function decodedBase64Length(value: string) {
  if (!value) return 0
  return (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0)
}

function fail(message: string): never {
  throw new MailComposeError(message)
}
