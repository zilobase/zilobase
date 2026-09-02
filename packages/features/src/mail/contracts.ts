export const mailConnectionStatuses = [
  "disconnected",
  "connected",
  "reconnect_required",
] as const

export type MailConnectionStatus = (typeof mailConnectionStatuses)[number]

export type MailAddress = {
  address: string
  name: string | null
}

export type MailAttachmentMetadata = {
  attachmentId: string
  contentId: string | null
  filename: string
  inline: boolean
  messageId: string
  mimeType: string
  size: number
}

export type MailMessageRecord = {
  attachmentCount: number
  attachments: MailAttachmentMetadata[]
  bcc: MailAddress[]
  bodyHtml: string | null
  bodyText: string | null
  cc: MailAddress[]
  date: string | null
  draftId: string | null
  from: MailAddress | null
  hasFullBody: boolean
  historyId: string
  id: string
  inReplyTo: string | null
  internalDate: number
  labelIds: string[]
  messageIdHeader: string | null
  references: string[]
  replyTo: MailAddress | null
  sizeEstimate: number
  snippet: string
  subject: string
  threadId: string
  to: MailAddress[]
}

export type MailThreadSummary = {
  attachmentCount: number
  id: string
  internalDate: number
  labelIds: string[]
  latestMessageId: string
  messageCount: number
  messageIds: string[]
  participants: MailAddress[]
  snippet: string
  starred: boolean
  subject: string
  unread: boolean
}

export type MailLabelRecord = {
  color: { backgroundColor: string; textColor: string } | null
  id: string
  labelListVisibility: string | null
  messageListVisibility: string | null
  messagesTotal: number | null
  messagesUnread: number | null
  name: string
  threadsTotal: number | null
  threadsUnread: number | null
  type: "system" | "user"
}

export type MailConnection = {
  accountId?: string | null
  bindingId?: string | null
  connectionId: string | null
  email: string | null
  mailboxReady: boolean
  mailboxRevision: number
  providerConfigured: boolean
  status: MailConnectionStatus
  watchExpiresAt: string | null
  workspaceId?: string | null
}

export type MailView =
  | "all_mail"
  | "archive"
  | "bin"
  | "drafts"
  | "inbox"
  | "sent"
  | "spam"
  | "starred"
  | "trash"
  | "unread"

export type MailSyncRequest = {
  connectionId: string
  historyId?: string
  knownMessageIds?: string[]
  knownThreadIds?: string[]
  pageToken?: string
  query?: string
  view: MailView
}

export type MailSyncResponse = {
  deletedMessageIds: string[]
  deletedThreadIds: string[]
  historyId: string
  labels: MailLabelRecord[]
  mailboxRevision: number
  messages: MailMessageRecord[]
  mode: "full" | "incremental" | "recovery"
  nextPageToken: string | null
  threads: MailThreadSummary[]
}

export type MailModifyRequest = {
  addLabelIds?: string[]
  removeLabelIds?: string[]
}

export type MailBatchModifyRequest = MailModifyRequest & {
  ids: string[]
}

export type MailSystemAction = "restore" | "trash"

export type MailActionRequest = {
  action: MailSystemAction
}

export type MailThreadMutationResponse = {
  messages: MailMessageRecord[]
  thread: MailThreadSummary
}

export type MailMessageMutationResponse = {
  message: MailMessageRecord
}

export type MailBatchMutationResponse = {
  acceptedIds: string[]
}

export type MailLabelWriteRequest = {
  color?: { backgroundColor: string; textColor: string }
  labelListVisibility?: "labelHide" | "labelShow" | "labelShowIfUnread"
  messageListVisibility?: "hide" | "show"
  name?: string
}

export type MailComposeAttachment = {
  contentBase64: string
  filename: string
  mimeType: string
}

export type MailComposeRequest = {
  attachments: MailComposeAttachment[]
  bcc: MailAddress[]
  bodyText: string
  cc: MailAddress[]
  clientOperationId: string
  draftId?: string
  inReplyTo?: string
  references?: string[]
  replyTo?: MailAddress
  senderName?: string
  subject: string
  threadId?: string
  to: MailAddress[]
}

export type MailDraftResponse = {
  draftId: string
  message: MailMessageRecord
}

export type MailSendResponse = {
  message: MailMessageRecord
  reused: boolean
}
