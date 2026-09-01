import { eq } from "drizzle-orm"

import { db } from "../../infrastructure/database"
import { gmailAccount, gmailConnection } from "../../infrastructure/database/schema"
import { getRequiredStringEnv, type RuntimeEnv } from "../../shared/config/config"
import { decryptMailSecret } from "./security/mail-credentials"

const GMAIL_API_ORIGIN = "https://gmail.googleapis.com"
const GMAIL_BATCH_URL = "https://gmail.googleapis.com/batch/gmail/v1"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const REQUEST_TIMEOUT_MS = 15_000
const SAFE_READ_RETRIES = 2
const GMAIL_BATCH_SIZE = 50
const MAX_ATTACHMENT_DOWNLOAD_BYTES = 30 * 1024 * 1024
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000
const ACCESS_TOKEN_FALLBACK_TTL_MS = 5 * 60_000
const ACCESS_TOKEN_MAX_TTL_MS = 55 * 60_000
const MAX_CACHED_ACCESS_TOKENS = 1_000

type CachedAccessToken = {
  accessToken: string
  credentialVersion: string
  validUntil: number
}

type PendingAccessToken = {
  credentialVersion: string
  promise: Promise<string>
}

const gmailAccessTokens = new Map<string, CachedAccessToken>()
const pendingGmailAccessTokens = new Map<string, PendingAccessToken>()

export type GmailHeader = { name?: string; value?: string }
export type GmailPart = {
  body?: { attachmentId?: string; data?: string; size?: number }
  filename?: string
  headers?: GmailHeader[]
  mimeType?: string
  partId?: string
  parts?: GmailPart[]
}
export type GmailMessage = {
  historyId?: string
  id?: string
  internalDate?: string
  labelIds?: string[]
  payload?: GmailPart
  sizeEstimate?: number
  snippet?: string
  threadId?: string
}
export type GmailThread = {
  historyId?: string
  id?: string
  messages?: GmailMessage[]
  snippet?: string
}
export type GmailDraft = {
  id?: string
  message?: GmailMessage
}
export type GmailHistory = {
  id?: string
  labelsAdded?: Array<{ labelIds?: string[]; message?: GmailMessage }>
  labelsRemoved?: Array<{ labelIds?: string[]; message?: GmailMessage }>
  messages?: GmailMessage[]
  messagesAdded?: Array<{ message?: GmailMessage }>
  messagesDeleted?: Array<{ message?: GmailMessage }>
}

export type GmailConnectionRow =
  | typeof gmailAccount.$inferSelect
  | typeof gmailConnection.$inferSelect

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "authorization_revoked" | "history_cursor_invalid" | "provider_error" | "quota_exceeded",
    readonly retryable = false,
  ) {
    super(message)
    this.name = "GmailApiError"
  }
}

export async function createGmailGateway(
  env: RuntimeEnv,
  connection: GmailConnectionRow,
  fetcher: typeof fetch = fetch,
) {
  const credentialVersion = [
    connection.refreshTokenKeyVersion,
    connection.refreshTokenIv,
    connection.refreshTokenCiphertext,
  ].join(":")
  const accessToken = await getCachedGmailAccessToken(
    { connectionId: connection.id, credentialVersion },
    async () => {
      const refreshToken = await decryptMailSecret(
        env,
        {
          ciphertext: connection.refreshTokenCiphertext,
          iv: connection.refreshTokenIv,
          keyVersion: connection.refreshTokenKeyVersion,
        },
        { connectionId: connection.id, purpose: "refresh_token", userId: connection.userId },
      )
      const tokenResponse = await fetcher(GOOGLE_TOKEN_URL, {
        body: new URLSearchParams({
          client_id: getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_ID"),
          client_secret: getRequiredStringEnv(env, "GMAIL_GOOGLE_CLIENT_SECRET"),
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const token = (await tokenResponse.json().catch(() => ({}))) as {
        access_token?: string
        error?: string
        expires_in?: number
      }
      try {
        return {
          accessToken: accessTokenFromRefresh(tokenResponse.status, token),
          expiresInSeconds: token.expires_in,
        }
      } catch (error) {
        if (error instanceof GmailApiError && error.code === "authorization_revoked") {
          await db
            .update(gmailConnection)
            .set({ lastErrorCode: "authorization_revoked", status: "reconnect_required", updatedAt: new Date() })
            .where(eq(gmailConnection.id, connection.id))
          await db
            .update(gmailAccount)
            .set({ lastErrorCode: "authorization_revoked", status: "reconnect_required", updatedAt: new Date() })
            .where(eq(gmailAccount.id, connection.id))
        }
        throw error
      }
    },
  )
  return new GmailGateway(accessToken, fetcher)
}

export async function getCachedGmailAccessToken(
  input: { connectionId: string; credentialVersion: string },
  refresh: () => Promise<{ accessToken: string; expiresInSeconds?: number }>,
  now = Date.now(),
) {
  const cached = gmailAccessTokens.get(input.connectionId)
  if (cached?.credentialVersion === input.credentialVersion && cached.validUntil > now) {
    gmailAccessTokens.delete(input.connectionId)
    gmailAccessTokens.set(input.connectionId, cached)
    return cached.accessToken
  }
  if (cached) gmailAccessTokens.delete(input.connectionId)

  const pending = pendingGmailAccessTokens.get(input.connectionId)
  if (pending?.credentialVersion === input.credentialVersion) return pending.promise

  const promise = refresh().then(({ accessToken, expiresInSeconds }) => {
    const validUntil = now + accessTokenCacheTtl(expiresInSeconds)
    if (validUntil > now && pendingGmailAccessTokens.get(input.connectionId)?.promise === promise) {
      pruneAccessTokenCache(now)
      gmailAccessTokens.set(input.connectionId, {
        accessToken,
        credentialVersion: input.credentialVersion,
        validUntil,
      })
    }
    return accessToken
  })
  pendingGmailAccessTokens.set(input.connectionId, {
    credentialVersion: input.credentialVersion,
    promise,
  })
  try {
    return await promise
  } finally {
    if (pendingGmailAccessTokens.get(input.connectionId)?.promise === promise) {
      pendingGmailAccessTokens.delete(input.connectionId)
    }
  }
}

export function clearGmailAccessTokenCache(connectionId?: string) {
  if (connectionId) {
    gmailAccessTokens.delete(connectionId)
    pendingGmailAccessTokens.delete(connectionId)
    return
  }
  gmailAccessTokens.clear()
  pendingGmailAccessTokens.clear()
}

function accessTokenCacheTtl(expiresInSeconds: number | undefined) {
  if (!Number.isFinite(expiresInSeconds) || !expiresInSeconds || expiresInSeconds <= 0) {
    return ACCESS_TOKEN_FALLBACK_TTL_MS
  }
  return Math.min(
    ACCESS_TOKEN_MAX_TTL_MS,
    Math.max(0, expiresInSeconds * 1_000 - ACCESS_TOKEN_REFRESH_SKEW_MS),
  )
}

function pruneAccessTokenCache(now: number) {
  for (const [connectionId, cached] of gmailAccessTokens) {
    if (cached.validUntil <= now) gmailAccessTokens.delete(connectionId)
  }
  while (gmailAccessTokens.size >= MAX_CACHED_ACCESS_TOKENS) {
    const oldestConnectionId = gmailAccessTokens.keys().next().value
    if (!oldestConnectionId) break
    gmailAccessTokens.delete(oldestConnectionId)
  }
}

export function accessTokenFromRefresh(
  status: number,
  token: { access_token?: string; error?: string },
) {
  if (status >= 200 && status < 300 && token.access_token) return token.access_token
  if (token.error === "invalid_grant") {
    throw new GmailApiError("Reconnect Gmail to continue.", 401, "authorization_revoked")
  }
  throw new GmailApiError("Gmail authorization is temporarily unavailable.", 502, "provider_error", true)
}

export class GmailGateway {
  private readonly fetcher: typeof fetch

  constructor(
    private readonly accessToken: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.fetcher = fetcher.bind(globalThis)
  }

  async listThreads(input: {
    includeSpamTrash?: boolean
    labelIds?: string[]
    maxResults?: number
    pageToken?: string
    query?: string
  }) {
    const params = new URLSearchParams({ maxResults: String(input.maxResults ?? 50) })
    if (input.includeSpamTrash) params.set("includeSpamTrash", "true")
    for (const labelId of input.labelIds ?? []) params.append("labelIds", labelId)
    if (input.pageToken) params.set("pageToken", input.pageToken)
    if (input.query) params.set("q", input.query)
    return this.json<{ nextPageToken?: string; resultSizeEstimate?: number; threads?: GmailThread[] }>(
      `/gmail/v1/users/me/threads?${params}`,
    )
  }

  getThread(threadId: string, format: "full" | "metadata" = "metadata") {
    const params = new URLSearchParams({ format })
    if (format === "metadata") {
      for (const header of MAIL_METADATA_HEADERS) params.append("metadataHeaders", header)
    }
    return this.json<GmailThread>(`/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?${params}`)
  }

  async getThreads(threadIds: string[], format: "full" | "metadata" = "metadata") {
    const threads: GmailThread[] = []
    for (let offset = 0; offset < threadIds.length; offset += GMAIL_BATCH_SIZE) {
      threads.push(...await this.batchGetThreads(threadIds.slice(offset, offset + GMAIL_BATCH_SIZE), format))
    }
    return threads
  }

  getMessage(messageId: string, format: "full" | "metadata" = "full") {
    const params = new URLSearchParams({ format })
    if (format === "metadata") {
      for (const header of MAIL_METADATA_HEADERS) params.append("metadataHeaders", header)
    }
    return this.json<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params}`)
  }

  listMessages(input: { maxResults?: number; query: string }) {
    const params = new URLSearchParams({
      maxResults: String(input.maxResults ?? 10),
      q: input.query,
    })
    return this.json<{ messages?: GmailMessage[]; resultSizeEstimate?: number }>(
      `/gmail/v1/users/me/messages?${params}`,
    )
  }

  getDraft(draftId: string) {
    return this.json<GmailDraft>(`/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`)
  }

  createDraft(input: { message: { raw: string; threadId?: string } }) {
    return this.writeJson<GmailDraft>("/gmail/v1/users/me/drafts", input)
  }

  updateDraft(draftId: string, input: { message: { raw: string; threadId?: string } }) {
    return this.writeJson<GmailDraft>(
      `/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
      input,
      "PUT",
    )
  }

  deleteDraft(draftId: string) {
    return this.writeJson(`/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`, undefined, "DELETE")
  }

  sendDraft(draftId: string) {
    return this.writeJson<GmailMessage>("/gmail/v1/users/me/drafts/send", { id: draftId })
  }

  sendMessage(input: { raw: string; threadId?: string }) {
    return this.writeJson<GmailMessage>("/gmail/v1/users/me/messages/send", input)
  }

  getProfile() {
    return this.json<{ emailAddress?: string; historyId?: string; messagesTotal?: number; threadsTotal?: number }>(
      "/gmail/v1/users/me/profile",
    )
  }

  listLabels() {
    return this.json<{ labels?: GmailLabel[] }>("/gmail/v1/users/me/labels")
  }

  createLabel(input: GmailLabelWrite) {
    return this.writeJson<GmailLabel>("/gmail/v1/users/me/labels", input)
  }

  updateLabel(labelId: string, input: GmailLabelWrite) {
    return this.writeJson<GmailLabel>(
      `/gmail/v1/users/me/labels/${encodeURIComponent(labelId)}`,
      input,
      "PATCH",
    )
  }

  deleteLabel(labelId: string) {
    return this.writeJson(
      `/gmail/v1/users/me/labels/${encodeURIComponent(labelId)}`,
      undefined,
      "DELETE",
    )
  }

  modifyThread(threadId: string, input: GmailModifyRequest) {
    return this.writeJson<GmailThread>(
      `/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}/modify`,
      input,
    )
  }

  modifyMessage(messageId: string, input: GmailModifyRequest) {
    return this.writeJson<GmailMessage>(
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
      input,
    )
  }

  batchModifyMessages(ids: string[], input: GmailModifyRequest) {
    return this.writeJson("/gmail/v1/users/me/messages/batchModify", { ...input, ids })
  }

  async batchModifyThreads(ids: string[], input: GmailModifyRequest) {
    for (let offset = 0; offset < ids.length; offset += 5) {
      await Promise.all(ids.slice(offset, offset + 5).map((id) => this.modifyThread(id, input)))
    }
  }

  trashThread(threadId: string) {
    return this.writeJson<GmailThread>(`/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}/trash`, undefined)
  }

  untrashThread(threadId: string) {
    return this.writeJson<GmailThread>(`/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}/untrash`, undefined)
  }

  trashMessage(messageId: string) {
    return this.writeJson<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`, undefined)
  }

  untrashMessage(messageId: string) {
    return this.writeJson<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/untrash`, undefined)
  }

  listHistory(input: { pageToken?: string; startHistoryId: string }) {
    const params = new URLSearchParams({ startHistoryId: input.startHistoryId })
    if (input.pageToken) params.set("pageToken", input.pageToken)
    return this.json<{ history?: GmailHistory[]; historyId?: string; nextPageToken?: string }>(
      `/gmail/v1/users/me/history?${params}`,
      "history",
    )
  }

  getAttachment(messageId: string, attachmentId: string) {
    return this.request(
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    ).then(decodeGmailAttachmentResponse)
  }

  watch(topicName: string) {
    return this.writeJson<{ expiration?: string; historyId?: string }>(
      "/gmail/v1/users/me/watch",
      { topicName },
    )
  }

  async stop() {
    await this.writeJson("/gmail/v1/users/me/stop", {})
  }

  private async json<T>(path: string, operation?: "history") {
    const response = await this.request(path, operation)
    return (await response.json()) as T
  }

  private async writeJson<T = unknown>(
    path: string,
    body: unknown,
    method: "DELETE" | "PATCH" | "POST" | "PUT" = "POST",
  ) {
    let response: Response
    try {
      response = await this.fetcher(new URL(path, GMAIL_API_ORIGIN).toString(), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.accessToken}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw normalizeGmailTransportError(error)
    }
    if (!response.ok) throw normalizeGmailError(response.status)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  private async request(path: string, operation?: "history") {
    let lastError: GmailApiError | null = null
    for (let attempt = 0; attempt <= SAFE_READ_RETRIES; attempt += 1) {
      let response: Response
      try {
        response = await this.fetcher(new URL(path, GMAIL_API_ORIGIN).toString(), {
          headers: { accept: "application/json", authorization: `Bearer ${this.accessToken}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        lastError = normalizeGmailTransportError(error)
        if (attempt < SAFE_READ_RETRIES) continue
        throw lastError
      }
      if (response.ok) return response
      const error = normalizeGmailError(response.status, operation)
      if (!error.retryable || attempt === SAFE_READ_RETRIES) throw error
      lastError = error
    }
    throw lastError ?? new GmailApiError("Gmail request failed.", 502, "provider_error")
  }

  private async batchGetThreads(threadIds: string[], format: "full" | "metadata") {
    if (!threadIds.length) return []
    const boundary = `zilobase_${crypto.randomUUID().replaceAll("-", "")}`
    const body = `${threadIds.map((threadId, index) => {
      const params = new URLSearchParams({ format })
      if (format === "metadata") {
        for (const header of MAIL_METADATA_HEADERS) params.append("metadataHeaders", header)
      }
      return [
        `--${boundary}`,
        "Content-Type: application/http",
        `Content-ID: <thread-${index}>`,
        "",
        `GET /gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?${params} HTTP/1.1`,
        "Accept: application/json",
        "",
      ].join("\r\n")
    }).join("") }--${boundary}--\r\n`
    let lastError: GmailApiError | null = null
    for (let attempt = 0; attempt <= SAFE_READ_RETRIES; attempt += 1) {
      let response: Response
      try {
        response = await this.fetcher(GMAIL_BATCH_URL, {
          body,
          headers: {
            accept: "multipart/mixed",
            authorization: `Bearer ${this.accessToken}`,
            "content-type": `multipart/mixed; boundary=${boundary}`,
          },
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        lastError = normalizeGmailTransportError(error)
        if (attempt < SAFE_READ_RETRIES) continue
        throw lastError
      }
      if (!response.ok) {
        lastError = normalizeGmailError(response.status)
      } else {
        try {
          return parseGmailBatchThreads(await response.text(), response.headers.get("content-type"))
        } catch (error) {
          lastError = error instanceof GmailApiError
            ? error
            : new GmailApiError("Gmail returned an invalid batch response.", 502, "provider_error", true)
        }
      }
      if (!lastError.retryable || attempt === SAFE_READ_RETRIES) throw lastError
    }
    throw lastError ?? new GmailApiError("Gmail batch request failed.", 502, "provider_error")
  }
}

function normalizeGmailTransportError(error: unknown) {
  const name = error instanceof Error ? error.name : ""
  if (name === "AbortError" || name === "TimeoutError") {
    return new GmailApiError("Gmail did not respond in time.", 504, "provider_error", true)
  }
  return new GmailApiError("Gmail could not be reached.", 502, "provider_error", true)
}

function parseGmailBatchThreads(body: string, contentType: string | null) {
  const boundaryMatch = contentType?.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]
  if (!boundary) throw new GmailApiError("Gmail returned an invalid batch response.", 502, "provider_error", true)
  const threads: GmailThread[] = []
  for (const rawPart of body.split(`--${boundary}`).slice(1)) {
    const part = rawPart.trim()
    if (!part || part === "--") continue
    const responseStart = part.search(/HTTP\/1\.[01]\s+\d{3}/)
    if (responseStart < 0) throw new GmailApiError("Gmail returned an invalid batch response.", 502, "provider_error", true)
    const responsePart = part.slice(responseStart)
    const statusMatch = responsePart.match(/^HTTP\/1\.[01]\s+(\d{3})/)
    const bodyMatch = /\r?\n\r?\n/.exec(responsePart)
    if (!statusMatch || !bodyMatch) throw new GmailApiError("Gmail returned an invalid batch response.", 502, "provider_error", true)
    const status = Number(statusMatch[1])
    if (status < 200 || status >= 300) throw normalizeGmailError(status)
    try {
      threads.push(JSON.parse(responsePart.slice(bodyMatch.index + bodyMatch[0].length).trim()) as GmailThread)
    } catch {
      throw new GmailApiError("Gmail returned an invalid batch response.", 502, "provider_error", true)
    }
  }
  return threads
}

export function decodeGmailAttachmentResponse(response: Response, maxBytes = MAX_ATTACHMENT_DOWNLOAD_BYTES) {
  if (!response.body) throw new GmailApiError("Gmail returned an empty attachment.", 502, "provider_error")
  const decoder = new TextDecoder()
  let buffer = ""
  let foundData = false
  let finished = false
  let decodedBytes = 0
  const decoded = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    flush(controller) {
      if (!finished) controller.error(new Error("Gmail returned an invalid attachment payload."))
    },
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      if (!foundData) {
        const match = /"data"\s*:\s*"/.exec(buffer)
        if (!match) {
          if (buffer.length > 4_096) controller.error(new Error("Gmail returned an invalid attachment payload."))
          return
        }
        buffer = buffer.slice(match.index + match[0].length)
        foundData = true
      }
      if (finished) return
      const end = buffer.indexOf('"')
      const encoded = end >= 0 ? buffer.slice(0, end) : buffer
      if (!/^[A-Za-z0-9_-]*$/.test(encoded)) {
        controller.error(new Error("Gmail returned an invalid attachment payload."))
        return
      }
      const emitLength = end >= 0 ? encoded.length : encoded.length - (encoded.length % 4)
      if (emitLength > 0 && !enqueueAttachmentBytes(controller, base64UrlToBytes(encoded.slice(0, emitLength)))) return
      buffer = encoded.slice(emitLength)
      if (end >= 0) {
        if (buffer && !enqueueAttachmentBytes(controller, base64UrlToBytes(buffer))) return
        buffer = ""
        finished = true
      }

      function enqueueAttachmentBytes(target: TransformStreamDefaultController<Uint8Array>, bytes: Uint8Array) {
        decodedBytes += bytes.byteLength
        if (decodedBytes > maxBytes) {
          target.error(new GmailApiError("The Gmail attachment is too large to download.", 413, "provider_error"))
          return false
        }
        target.enqueue(bytes)
        return true
      }
    },
  }))
  return new Response(decoded, {
    headers: { "content-type": "application/octet-stream" },
  })
}

export type GmailLabel = {
  color?: { backgroundColor?: string; textColor?: string }
  id?: string
  labelListVisibility?: string
  messageListVisibility?: string
  messagesTotal?: number
  messagesUnread?: number
  name?: string
  threadsTotal?: number
  threadsUnread?: number
  type?: string
}

export type GmailModifyRequest = {
  addLabelIds?: string[]
  removeLabelIds?: string[]
}

export type GmailLabelWrite = {
  color?: { backgroundColor: string; textColor: string }
  labelListVisibility?: "labelHide" | "labelShow" | "labelShowIfUnread"
  messageListVisibility?: "hide" | "show"
  name?: string
}

export const MAIL_METADATA_HEADERS = [
  "Bcc",
  "Cc",
  "Content-ID",
  "Date",
  "From",
  "In-Reply-To",
  "Message-ID",
  "References",
  "Reply-To",
  "Subject",
  "To",
] as const

function normalizeGmailError(status: number, operation?: "history") {
  if (status === 401 || status === 403) {
    return new GmailApiError("Gmail authorization is no longer valid.", 401, "authorization_revoked")
  }
  if (operation === "history" && status === 404) {
    return new GmailApiError("The Gmail history cursor expired.", 409, "history_cursor_invalid")
  }
  if (status === 429) {
    return new GmailApiError("Gmail quota is temporarily exhausted.", 429, "quota_exceeded", true)
  }
  const retryable = status >= 500
  return new GmailApiError(
    retryable ? "Gmail is temporarily unavailable." : "The Gmail request could not be completed.",
    retryable ? 502 : status,
    "provider_error",
    retryable,
  )
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
