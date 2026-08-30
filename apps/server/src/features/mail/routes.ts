import { eq } from "drizzle-orm"
import { Hono, type Context } from "hono"
import type {
  MailActionRequest,
  MailBatchModifyRequest,
  MailLabelWriteRequest,
  MailModifyRequest,
  MailSyncRequest,
  MailView,
} from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import { gmailConnection } from "../../infrastructure/database/schema"
import { getCanonicalWebOrigin } from "../../shared/config/config"
import type { AppBindings } from "../../shared/types"
import { getZilobaseDiscoveryDocument } from "../instance/service"
import {
  beginGmailOauth,
  completeGmailOauth,
  GmailOauthError,
  gmailProviderConfigured,
  revokeGmailConnection,
} from "./google-oauth"
import { createGmailGateway, GmailApiError } from "./gmail-gateway"
import { GmailPushError, processGmailPubsubRequest } from "./gmail-pubsub"
import { initializeGmailWatch, stopGmailWatch } from "./gmail-watch"
import {
  createMailRealtimeTicket,
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
} from "./mail-realtime-ticket"
import { getMailRealtimeWebSocketUrl } from "../../infrastructure/runtime/runtime-adapter"
import { normalizeGmailLabels, normalizeGmailMessage, normalizeGmailThread } from "./mail-normalize"
import { synchronizeMailbox } from "./mail-sync"
import { MailConcurrencyError, withMailUserConcurrency } from "./user-concurrency"

export const mailRoutes = new Hono<AppBindings>()

mailRoutes.get("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.userId, user.id))
    .limit(1)
  return c.json({
    connectionId: connection?.id ?? null,
    email: connection?.email ?? null,
    mailboxReady: Boolean(connection),
    mailboxRevision: connection?.mailboxRevision ?? 0,
    providerConfigured: gmailProviderConfigured(c.env),
    status: connection?.status ?? "disconnected",
    watchExpiresAt: connection?.watchExpiresAt?.toISOString() ?? null,
  })
})

mailRoutes.post("/oauth/start", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  if (!gmailProviderConfigured(c.env)) {
    return c.json({ message: "Gmail is not configured on this server." }, 503)
  }
  const body = (await c.req.json().catch(() => ({}))) as { client?: unknown }
  if (body.client !== "web" && body.client !== "desktop") {
    return c.json({ message: "A valid Gmail client is required." }, 400)
  }
  try {
    return c.json({
      authorizationUrl: await beginGmailOauth(c.env, {
        clientKind: body.client,
        userId: user.id,
      }),
    })
  } catch (error) {
    return oauthError(c, error)
  }
})

mailRoutes.get("/oauth/google/callback", async (c) => {
  const state = c.req.query("state")
  const code = c.req.query("code")
  if (!state || !code || c.req.query("error")) {
    return c.html(renderOauthResult("Gmail connection was cancelled."), 400)
  }
  try {
    const result = await completeGmailOauth(c.env, { code, state })
    const [connected] = await db
      .select()
      .from(gmailConnection)
      .where(eq(gmailConnection.id, result.connectionId))
      .limit(1)
    if (connected) {
      await initializeGmailWatch(c.env, connected).catch(async (error) => {
        await db
          .update(gmailConnection)
          .set({
            lastErrorCode: error instanceof GmailApiError ? error.code : "watch_failed",
            updatedAt: new Date(),
          })
          .where(eq(gmailConnection.id, connected.id))
      })
    }
    if (result.clientKind === "desktop") {
      const discovery = await getZilobaseDiscoveryDocument(c.env)
      const deepLink = buildDesktopMailReturnUrl(discovery)
      return c.html(renderOauthResult("Gmail connected. Return to Zilobase Desktop.", deepLink.toString()))
    }
    const target = new URL("/mail?connection=success", getCanonicalWebOrigin(c.env))
    return c.redirect(target.toString())
  } catch (error) {
    return c.html(
      renderOauthResult(error instanceof Error ? error.message : "Gmail could not be connected."),
      error instanceof GmailOauthError ? (error.status as 400) : 500,
    )
  }
})

mailRoutes.delete("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.userId, user.id))
    .limit(1)
  if (connection) {
    await stopGmailWatch(c.env, connection)
    await revokeGmailConnection(c.env, connection)
    await db.delete(gmailConnection).where(eq(gmailConnection.id, connection.id))
  }
  return c.json({ success: true })
})

mailRoutes.post("/google/pubsub", async (c) => {
  try {
    await processGmailPubsubRequest(c.env, c.req.raw)
    return c.body(null, 204)
  } catch (error) {
    const status = error instanceof GmailPushError ? error.status : 500
    return c.json(
      { message: error instanceof GmailPushError ? error.message : "Gmail push could not be processed." },
      status === 400 ? 400
        : status === 401 ? 401
          : status === 403 ? 403
            : status === 413 ? 413
              : status === 503 ? 503
                : 500,
    )
  }
})

mailRoutes.post("/sync", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = (await c.req.json().catch(() => null)) as Partial<MailSyncRequest> | null
  if (!body || body.connectionId !== owned.connection.id || !isMailView(body.view)) {
    return c.json({ message: "A valid mail synchronization request is required." }, 400)
  }
  if (
    !optionalCursor(body.historyId) ||
    !optionalCursor(body.pageToken) ||
    !optionalQuery(body.query) ||
    !optionalIdList(body.knownMessageIds) ||
    !optionalIdList(body.knownThreadIds)
  ) {
    return c.json({ message: "The mail synchronization cursor is invalid." }, 400)
  }
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await synchronizeMailbox(gateway, body as MailSyncRequest, owned.connection.mailboxRevision)),
  )
})

mailRoutes.get("/threads/:threadId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  if (!threadId) return c.json({ message: "A valid Gmail thread ID is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const record = normalizeGmailThread(await gateway.getThread(threadId, "full"), true)
    return c.json({ messages: record.messages, thread: record.summary })
  })
})

mailRoutes.get("/messages/:messageId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const messageId = safeGmailId(c.req.param("messageId"))
  if (!messageId) return c.json({ message: "A valid Gmail message ID is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json({ message: normalizeGmailMessage(await gateway.getMessage(messageId, "full"), true) }),
  )
})

mailRoutes.get("/messages/:messageId/attachments/:attachmentId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const messageId = safeGmailId(c.req.param("messageId"))
  const attachmentId = safeGmailId(c.req.param("attachmentId"))
  if (!messageId || !attachmentId) return c.json({ message: "A valid Gmail attachment is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const upstream = await gateway.getAttachment(messageId, attachmentId)
    return new Response(upstream.body, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      },
      status: upstream.status,
    })
  })
})

mailRoutes.get("/labels", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const result = await gateway.listLabels()
    return c.json({ labels: normalizeGmailLabels(result.labels ?? []) })
  })
})

mailRoutes.post("/labels", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = parseMailLabelWriteRequest(await c.req.json().catch(() => null), true)
  if (!body) return c.json({ message: "A valid Gmail label is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const label = normalizeGmailLabels([await gateway.createLabel(body)])[0]
    if (!label) throw new GmailApiError("Gmail returned an invalid label.", 502, "provider_error")
    return c.json({ label })
  })
})

mailRoutes.patch("/labels/:labelId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const labelId = safeUserLabelId(c.req.param("labelId"))
  const body = parseMailLabelWriteRequest(await c.req.json().catch(() => null), false)
  if (!labelId || !body) return c.json({ message: "A valid Gmail label update is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const label = normalizeGmailLabels([await gateway.updateLabel(labelId, body)])[0]
    if (!label) throw new GmailApiError("Gmail returned an invalid label.", 502, "provider_error")
    return c.json({ label })
  })
})

mailRoutes.delete("/labels/:labelId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const labelId = safeUserLabelId(c.req.param("labelId"))
  if (!labelId) return c.json({ message: "A valid Gmail label is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.deleteLabel(labelId)
    return c.json({ deletedId: labelId })
  })
})

mailRoutes.post("/threads/batch-modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = parseMailBatchModifyRequest(await c.req.json().catch(() => null), 50)
  if (!body) return c.json({ message: "A valid thread batch modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.batchModifyThreads(body.ids, body)
    return c.json({ acceptedIds: body.ids })
  })
})

mailRoutes.post("/messages/batch-modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = parseMailBatchModifyRequest(await c.req.json().catch(() => null), 1_000)
  if (!body) return c.json({ message: "A valid message batch modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.batchModifyMessages(body.ids, body)
    return c.json({ acceptedIds: body.ids })
  })
})

mailRoutes.post("/threads/:threadId/modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  const body = parseMailModifyRequest(await c.req.json().catch(() => null))
  if (!threadId || !body) return c.json({ message: "A valid thread modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.modifyThread(threadId, body)
    const record = normalizeGmailThread(await gateway.getThread(threadId, "metadata"), false)
    return c.json({ messages: record.messages, thread: record.summary })
  })
})

mailRoutes.post("/messages/:messageId/modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const messageId = safeGmailId(c.req.param("messageId"))
  const body = parseMailModifyRequest(await c.req.json().catch(() => null))
  if (!messageId || !body) return c.json({ message: "A valid message modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.modifyMessage(messageId, body)
    return c.json({ message: normalizeGmailMessage(await gateway.getMessage(messageId, "metadata"), false) })
  })
})

mailRoutes.post("/threads/:threadId/action", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  const body = parseMailActionRequest(await c.req.json().catch(() => null))
  if (!threadId || !body) return c.json({ message: "A valid thread action is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    if (body.action === "trash") await gateway.trashThread(threadId)
    else await gateway.untrashThread(threadId)
    const record = normalizeGmailThread(await gateway.getThread(threadId, "metadata"), false)
    return c.json({ messages: record.messages, thread: record.summary })
  })
})

mailRoutes.post("/messages/:messageId/action", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const messageId = safeGmailId(c.req.param("messageId"))
  const body = parseMailActionRequest(await c.req.json().catch(() => null))
  if (!messageId || !body) return c.json({ message: "A valid message action is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    if (body.action === "trash") await gateway.trashMessage(messageId)
    else await gateway.untrashMessage(messageId)
    return c.json({ message: normalizeGmailMessage(await gateway.getMessage(messageId, "metadata"), false) })
  })
})

mailRoutes.post("/realtime-ticket", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const ticket = await createMailRealtimeTicket({
    connectionId: owned.connection.id,
    userId: owned.userId,
  }, c.env)
  const websocketUrl = new URL(getMailRealtimeWebSocketUrl(c.req.raw, c.env))
  websocketUrl.searchParams.set("connection", owned.connection.id)
  return c.json({
    ...ticket,
    websocketProtocols: [
      MAIL_REALTIME_PROTOCOL,
      `${MAIL_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.ticket}`,
    ],
    websocketUrl: websocketUrl.toString(),
  })
})

function oauthError(c: Context<AppBindings>, error: unknown) {
  const status = error instanceof GmailOauthError ? error.status : 500
  return c.json(
    { message: error instanceof Error ? error.message : "Gmail could not be connected." },
    status === 400 ? 400 : 500,
  )
}

async function requireOwnedConnection(c: Context<AppBindings>) {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.userId, user.id))
    .limit(1)
  if (!connection) return c.json({ message: "Connect Gmail to continue." }, 409)
  if (connection.status !== "connected") return c.json({ message: "Reconnect Gmail to continue." }, 409)
  return { connection, userId: user.id }
}

async function runMailOperation(
  c: Context<AppBindings>,
  userId: string,
  connection: typeof gmailConnection.$inferSelect,
  operation: (gateway: Awaited<ReturnType<typeof createGmailGateway>>) => Promise<Response>,
) {
  try {
    return await withMailUserConcurrency(userId, async () => {
      const gateway = await createGmailGateway(c.env, connection)
      return operation(gateway)
    })
  } catch (error) {
    if (error instanceof GmailApiError && error.code === "authorization_revoked") {
      await db
        .update(gmailConnection)
        .set({ lastErrorCode: error.code, status: "reconnect_required", updatedAt: new Date() })
        .where(eq(gmailConnection.id, connection.id))
    }
    const status = error instanceof GmailApiError || error instanceof MailConcurrencyError
      ? error.status
      : 500
    return c.json(
      { message: error instanceof Error ? error.message : "The Gmail operation failed." },
      statusCode(status),
    )
  }
}

function statusCode(status: number): 400 | 401 | 404 | 409 | 429 | 500 | 502 | 504 {
  return [400, 401, 404, 409, 429, 500, 502, 504].includes(status)
    ? status as 400 | 401 | 404 | 409 | 429 | 500 | 502 | 504
    : 500
}

function safeGmailId(value: string) {
  return /^[A-Za-z0-9_-]{1,512}$/.test(value) ? value : null
}

function optionalCursor(value: unknown) {
  return value === undefined || (typeof value === "string" && value.length > 0 && value.length <= 1024)
}

function optionalQuery(value: unknown) {
  return value === undefined || (typeof value === "string" && value.length <= 2048)
}

function optionalIdList(value: unknown) {
  return value === undefined || (
    Array.isArray(value) &&
    value.length <= 5_000 &&
    value.every((id) => typeof id === "string" && safeGmailId(id) !== null)
  )
}

export function parseMailModifyRequest(value: unknown): MailModifyRequest | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const addLabelIds = parseLabelIds(input.addLabelIds)
  const removeLabelIds = parseLabelIds(input.removeLabelIds)
  if (!addLabelIds || !removeLabelIds || addLabelIds.length + removeLabelIds.length === 0) return null
  if (addLabelIds.some((id) => removeLabelIds.includes(id))) return null
  return {
    ...(addLabelIds.length ? { addLabelIds } : {}),
    ...(removeLabelIds.length ? { removeLabelIds } : {}),
  }
}

export function parseMailBatchModifyRequest(value: unknown, limit: number): MailBatchModifyRequest | null {
  const modification = parseMailModifyRequest(value)
  if (!modification || !value || typeof value !== "object") return null
  const ids = (value as Record<string, unknown>).ids
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > limit) return null
  if (!ids.every((id) => typeof id === "string" && safeGmailId(id))) return null
  const uniqueIds = [...new Set(ids as string[])]
  if (uniqueIds.length !== ids.length) return null
  return { ...modification, ids: uniqueIds }
}

export function parseMailActionRequest(value: unknown): MailActionRequest | null {
  if (!value || typeof value !== "object") return null
  const action = (value as Record<string, unknown>).action
  return action === "restore" || action === "trash" ? { action } : null
}

export function parseMailLabelWriteRequest(value: unknown, creating: boolean): MailLabelWriteRequest | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const output: MailLabelWriteRequest = {}
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 225 || /[\r\n\0]/.test(input.name)) return null
    output.name = input.name.trim()
  }
  if (input.labelListVisibility !== undefined) {
    if (!["labelHide", "labelShow", "labelShowIfUnread"].includes(input.labelListVisibility as string)) return null
    output.labelListVisibility = input.labelListVisibility as NonNullable<MailLabelWriteRequest["labelListVisibility"]>
  }
  if (input.messageListVisibility !== undefined) {
    if (!["hide", "show"].includes(input.messageListVisibility as string)) return null
    output.messageListVisibility = input.messageListVisibility as NonNullable<MailLabelWriteRequest["messageListVisibility"]>
  }
  if (input.color !== undefined) {
    if (isLabelColor(input.color)) output.color = {
      backgroundColor: input.color.backgroundColor,
      textColor: input.color.textColor,
    }
    else return null
  }
  return (creating ? Boolean(output.name) : Object.keys(output).length > 0) ? output : null
}

function parseLabelIds(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) return null
  if (!value.every((id) => typeof id === "string" && safeGmailId(id))) return null
  const ids = [...new Set(value as string[])]
  return ids.length === value.length ? ids : null
}

function isLabelColor(value: unknown): value is { backgroundColor: string; textColor: string } {
  if (!value || typeof value !== "object") return false
  const color = value as Record<string, unknown>
  return typeof color.backgroundColor === "string" && GMAIL_LABEL_COLORS.has(color.backgroundColor.toLowerCase()) &&
    typeof color.textColor === "string" && GMAIL_LABEL_COLORS.has(color.textColor.toLowerCase())
}

function safeUserLabelId(value: string) {
  return /^Label_[A-Za-z0-9_-]{1,500}$/.test(value) ? value : null
}

const GMAIL_LABEL_COLORS = new Set([
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#f3f3f3", "#ffffff",
  "#fb4c2f", "#ffad47", "#fad165", "#16a766", "#43d692", "#4a86e8", "#a479e2", "#f691b3",
  "#f6c5be", "#ffe6c7", "#fef1d1", "#b9e4d0", "#c6f3de", "#c9daf8", "#e4d7f5", "#fcdee8",
  "#efa093", "#ffd6a2", "#fce8b3", "#89d3b2", "#a0eac9", "#a4c2f4", "#d0bcf1", "#fbc8d9",
  "#e66550", "#ffbc6b", "#fcda83", "#44b984", "#68dfa9", "#6d9eeb", "#b694e8", "#f7a7c0",
  "#cc3a21", "#eaa041", "#f2c960", "#149e60", "#3dc789", "#3c78d8", "#8e63ce", "#e07798",
  "#ac2b16", "#cf8933", "#d5ae49", "#0b804b", "#2a9c68", "#285bac", "#653e9b", "#b65775",
  "#822111", "#a46a21", "#aa8831", "#076239", "#1a764d", "#1c4587", "#41236d", "#83334c",
  "#464646", "#e7e7e7", "#0d3472", "#b6cff5", "#0d3b44", "#98d7e4", "#3d188e", "#e3d7ff",
  "#711a36", "#fbd3e0", "#8a1c0a", "#f2b2a8", "#7a2e0b", "#ffc8af", "#7a4706", "#ffdeb5",
  "#594c05", "#fbe983", "#684e07", "#fdedc1", "#0b4f30", "#b3efd3", "#04502e", "#a2dcc1",
  "#c2c2c2", "#4986e7", "#2da2bb", "#b99aff", "#994a64", "#f691b2", "#ff7537", "#ffad46",
  "#662e37", "#ebdbde", "#cca6ac", "#094228", "#42d692", "#16a765",
])

function isMailView(value: unknown): value is MailView {
  return ["archive", "drafts", "inbox", "sent", "spam", "starred", "trash", "unread"].includes(value as string)
}

export function buildDesktopMailReturnUrl(input: {
  apiOrigin: string
  instanceId: string
}) {
  const deepLink = new URL("zilobase://open")
  deepLink.searchParams.set("instance", input.instanceId)
  deepLink.searchParams.set("path", "/mail?connection=success")
  deepLink.searchParams.set("server", input.apiOrigin)
  return deepLink
}

function renderOauthResult(message: string, deepLink?: string) {
  const escapedMessage = escapeHtml(message)
  const escapedLink = deepLink ? escapeHtml(deepLink) : null
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gmail connection</title></head><body><main><h1>Gmail connection</h1><p>${escapedMessage}</p>${escapedLink ? `<p><a href="${escapedLink}">Open Zilobase Desktop</a></p>` : ""}</main></body></html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
