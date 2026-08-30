import { eq } from "drizzle-orm"

import { db } from "../../infrastructure/database"
import { gmailConnection } from "../../infrastructure/database/schema"
import { getRequiredStringEnv, type RuntimeEnv } from "../../shared/config/config"
import { decryptMailSecret } from "./security/mail-credentials"

const GMAIL_API_ORIGIN = "https://gmail.googleapis.com"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const REQUEST_TIMEOUT_MS = 15_000
const SAFE_READ_RETRIES = 2

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
export type GmailHistory = {
  id?: string
  labelsAdded?: Array<{ labelIds?: string[]; message?: GmailMessage }>
  labelsRemoved?: Array<{ labelIds?: string[]; message?: GmailMessage }>
  messages?: GmailMessage[]
  messagesAdded?: Array<{ message?: GmailMessage }>
  messagesDeleted?: Array<{ message?: GmailMessage }>
}

type GmailConnectionRow = typeof gmailConnection.$inferSelect

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
  }
  let accessToken: string
  try {
    accessToken = accessTokenFromRefresh(tokenResponse.status, token)
  } catch (error) {
    if (error instanceof GmailApiError && error.code === "authorization_revoked") {
      await db
        .update(gmailConnection)
        .set({ lastErrorCode: "authorization_revoked", status: "reconnect_required", updatedAt: new Date() })
        .where(eq(gmailConnection.id, connection.id))
    }
    throw error
  }
  return new GmailGateway(accessToken, fetcher)
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
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async listThreads(input: {
    labelIds?: string[]
    maxResults?: number
    pageToken?: string
    query?: string
  }) {
    const params = new URLSearchParams({ maxResults: String(input.maxResults ?? 50) })
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

  getMessage(messageId: string, format: "full" | "metadata" = "full") {
    const params = new URLSearchParams({ format })
    if (format === "metadata") {
      for (const header of MAIL_METADATA_HEADERS) params.append("metadataHeaders", header)
    }
    return this.json<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params}`)
  }

  getProfile() {
    return this.json<{ emailAddress?: string; historyId?: string; messagesTotal?: number; threadsTotal?: number }>(
      "/gmail/v1/users/me/profile",
    )
  }

  listLabels() {
    return this.json<{ labels?: GmailLabel[] }>("/gmail/v1/users/me/labels")
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

  private async writeJson<T = unknown>(path: string, body: unknown) {
    let response: Response
    try {
      response = await this.fetcher(new URL(path, GMAIL_API_ORIGIN), {
        body: JSON.stringify(body),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new GmailApiError("Gmail did not respond in time.", 504, "provider_error", true)
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
        response = await this.fetcher(new URL(path, GMAIL_API_ORIGIN), {
          headers: { accept: "application/json", authorization: `Bearer ${this.accessToken}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        lastError = new GmailApiError("Gmail did not respond in time.", 504, "provider_error", true)
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
}

export function decodeGmailAttachmentResponse(response: Response) {
  if (!response.body) throw new GmailApiError("Gmail returned an empty attachment.", 502, "provider_error")
  const decoder = new TextDecoder()
  let buffer = ""
  let foundData = false
  let finished = false
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
      if (emitLength > 0) controller.enqueue(base64UrlToBytes(encoded.slice(0, emitLength)))
      buffer = encoded.slice(emitLength)
      if (end >= 0) {
        if (buffer) controller.enqueue(base64UrlToBytes(buffer))
        buffer = ""
        finished = true
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
