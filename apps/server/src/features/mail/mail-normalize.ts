import type {
  MailAddress,
  MailAttachmentMetadata,
  MailLabelRecord,
  MailMessageRecord,
  MailThreadSummary,
} from "@zilobase/features/mail"

import type { GmailLabel, GmailMessage, GmailPart, GmailThread } from "./gmail-gateway"

export function normalizeGmailMessage(message: GmailMessage, includeBody: boolean): MailMessageRecord {
  const id = requireId(message.id, "message")
  const threadId = requireId(message.threadId, "thread")
  const headers = new Map(
    (message.payload?.headers ?? [])
      .filter((header) => header.name && header.value !== undefined)
      .map((header) => [header.name!.toLowerCase(), header.value!] as const),
  )
  const content = collectMessageContent(message.payload, id, includeBody)
  return {
    attachmentCount: content.attachments.length,
    attachments: content.attachments,
    bcc: parseMailAddresses(headers.get("bcc")),
    bodyHtml: content.html,
    bodyText: content.text,
    cc: parseMailAddresses(headers.get("cc")),
    date: headers.get("date") ?? null,
    draftId: null,
    from: parseMailAddresses(headers.get("from"))[0] ?? null,
    hasFullBody: includeBody,
    historyId: message.historyId ?? "0",
    id,
    inReplyTo: headers.get("in-reply-to") ?? null,
    internalDate: Number(message.internalDate ?? 0),
    labelIds: unique(message.labelIds ?? []),
    messageIdHeader: headers.get("message-id") ?? null,
    references: (headers.get("references") ?? "").split(/\s+/).filter(Boolean),
    replyTo: parseMailAddresses(headers.get("reply-to"))[0] ?? null,
    sizeEstimate: message.sizeEstimate ?? 0,
    snippet: message.snippet ?? "",
    subject: headers.get("subject") ?? "(no subject)",
    threadId,
    to: parseMailAddresses(headers.get("to")),
  }
}

export function normalizeGmailThread(thread: GmailThread, includeBody = false) {
  const id = requireId(thread.id, "thread")
  const messages = (thread.messages ?? []).map((message) => normalizeGmailMessage(message, includeBody))
  if (!messages.length) throw new Error(`Gmail thread ${id} has no messages.`)
  messages.sort((left, right) => left.internalDate - right.internalDate)
  const latest = messages.at(-1)!
  const participants = dedupeAddresses(messages.flatMap((message) => [message.from, ...message.to].filter(Boolean) as MailAddress[]))
  const summary: MailThreadSummary = {
    attachmentCount: messages.reduce((total, message) => total + message.attachmentCount, 0),
    id,
    internalDate: latest.internalDate,
    labelIds: unique(messages.flatMap((message) => message.labelIds)),
    latestMessageId: latest.id,
    messageCount: messages.length,
    messageIds: messages.map((message) => message.id),
    participants,
    snippet: latest.snippet || thread.snippet || "",
    starred: messages.some((message) => message.labelIds.includes("STARRED")),
    subject: latest.subject,
    unread: messages.some((message) => message.labelIds.includes("UNREAD")),
  }
  return { messages, summary }
}

export function normalizeGmailLabels(labels: GmailLabel[]): MailLabelRecord[] {
  return labels.flatMap((label) => {
    if (!label.id || !label.name) return []
    return [{
      color: label.color?.backgroundColor && label.color.textColor
        ? { backgroundColor: label.color.backgroundColor, textColor: label.color.textColor }
        : null,
      id: label.id,
      labelListVisibility: label.labelListVisibility ?? null,
      messageListVisibility: label.messageListVisibility ?? null,
      messagesTotal: label.messagesTotal ?? null,
      messagesUnread: label.messagesUnread ?? null,
      name: label.name,
      threadsTotal: label.threadsTotal ?? null,
      threadsUnread: label.threadsUnread ?? null,
      type: label.type === "user" ? "user" as const : "system" as const,
    }]
  })
}

export function parseMailAddresses(value?: string): MailAddress[] {
  if (!value) return []
  return splitAddressList(value).flatMap((part) => {
    const bracket = /^(.*)<([^<>]+)>$/.exec(part.trim())
    const rawName = bracket?.[1]?.trim().replace(/^"|"$/g, "") ?? ""
    const address = (bracket?.[2] ?? part).trim().toLowerCase()
    if (!/^[^\s@<>]+@[^\s@<>]+$/.test(address)) return []
    return [{ address, name: rawName || null }]
  })
}

function collectMessageContent(part: GmailPart | undefined, messageId: string, includeBody: boolean) {
  const attachments: MailAttachmentMetadata[] = []
  let html: string | null = null
  let text: string | null = null
  const walk = (current?: GmailPart) => {
    if (!current) return
    const filename = current.filename?.trim() ?? ""
    if (current.body?.attachmentId) {
      const contentId = headerValue(current, "content-id")?.replace(/^<|>$/g, "") ?? null
      attachments.push({
        attachmentId: current.body.attachmentId,
        contentId,
        filename: filename || "attachment",
        inline: Boolean(contentId) || headerValue(current, "content-disposition")?.toLowerCase().startsWith("inline") === true,
        messageId,
        mimeType: current.mimeType ?? "application/octet-stream",
        size: current.body.size ?? 0,
      })
    } else if (includeBody && current.body?.data) {
      const decoded = decodeBase64Url(current.body.data)
      if (current.mimeType === "text/html" && html === null) html = decoded
      if (current.mimeType === "text/plain" && text === null) text = decoded
    }
    for (const child of current.parts ?? []) walk(child)
  }
  walk(part)
  return { attachments, html, text }
}

function headerValue(part: GmailPart, name: string) {
  return part.headers?.find((header) => header.name?.toLowerCase() === name)?.value
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

function splitAddressList(value: string) {
  const entries: string[] = []
  let current = ""
  let quoted = false
  for (const character of value) {
    if (character === '"') quoted = !quoted
    if (character === "," && !quoted) {
      entries.push(current)
      current = ""
    } else current += character
  }
  if (current) entries.push(current)
  return entries
}

function dedupeAddresses(addresses: MailAddress[]) {
  const seen = new Set<string>()
  return addresses.filter((address) => {
    if (seen.has(address.address)) return false
    seen.add(address.address)
    return true
  })
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function requireId(value: string | undefined, kind: string) {
  if (!value) throw new Error(`Gmail returned a ${kind} without an ID.`)
  return value
}
