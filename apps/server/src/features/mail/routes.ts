import { eq } from "drizzle-orm"
import { Hono, type Context } from "hono"
import type { MailSyncRequest, MailView } from "@zilobase/features/mail"

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
