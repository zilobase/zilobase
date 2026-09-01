import { and, count, eq } from "drizzle-orm"
import { Hono, type Context } from "hono"
import {
  mailSystemFolderIds,
  mailViewTemplateIds,
  normalizeMailFilterExpression,
  type MailActionRequest,
  type MailBatchModifyRequest,
  type MailLabelWriteRequest,
  type MailModifyRequest,
  type MailSyncRequest,
  type MailView,
  type MailViewConfig,
  type MailViewTemplateId,
} from "@zilobase/features/mail"

import { db, runWithDbEnv } from "../../infrastructure/database"
import {
  gmailAccount,
  gmailConnection,
  gmailWorkspaceConnection,
  member,
} from "../../infrastructure/database/schema"
import {
  getCanonicalWebOrigin,
  isLegacyMailRoutesEnabled,
  isMailFeatureEnabled,
} from "../../shared/config/config"
import type { AppBindings } from "../../shared/types"
import { getZilobaseDiscoveryDocument } from "../instance/service"
import {
  beginGmailOauth,
  completeGmailOauth,
  GmailOauthError,
  gmailProviderConfigured,
  revokeGmailConnection,
} from "./google-oauth"
import { clearGmailAccessTokenCache, createGmailGateway, GmailApiError } from "./gmail-gateway"
import { GmailPushError, processGmailPubsubRequest } from "./gmail-pubsub"
import { initializeGmailWatch, stopGmailWatch } from "./gmail-watch"
import {
  createMailRealtimeTicket,
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
} from "./mail-realtime-ticket"
import { createGmailDraft, sendGmailComposition, updateGmailDraft } from "./mail-compose"
import { MailComposeError, parseMailComposeRequest } from "./mail-mime"
import { recordMailMetric } from "./mail-metrics"
import { getMailRealtimeWebSocketUrl } from "../../infrastructure/runtime/runtime-adapter"
import { normalizeGmailLabels, normalizeGmailMessage, normalizeGmailThread } from "./mail-normalize"
import { synchronizeMailbox } from "./mail-sync"
import { MailConcurrencyError, withMailUserConcurrency } from "./user-concurrency"
import {
  createMailView,
  deleteMailView,
  duplicateMailView,
  listMailViews,
  MailViewServiceError,
  reorderMailViews,
  updateMailView,
} from "./mail-views"
import {
  advanceMailIndex,
  ensureMailIndexState,
  getMailIndexProgress,
} from "./mail-index"
import { MailQueryError, queryIndexedMail, queryIndexedMailGroups } from "./mail-query"
import {
  createMailProperty,
  deleteMailProperty,
  listMailProperties,
  listMailThreadPropertyValues,
  MailPropertyError,
  setMailThreadPropertyValue,
  updateMailProperty,
} from "./mail-properties"
import {
  advanceMailReminders,
  cancelMailReminder,
  listMailReminders,
  MailReminderError,
  scheduleMailReminder,
} from "./mail-reminders"
import { inspectOrExecuteUnsubscribe, MailUnsubscribeError } from "./safe-unsubscribe"
import { drainMailDatabaseSyncOutbox, getMailDatabaseSyncViewStatus, MailDatabaseSyncPausedError } from "./mail-database-sync-worker"

export const mailRoutes = new Hono<AppBindings>()

mailRoutes.use("*", async (c, next) => {
  try {
    if (!isMailFeatureEnabled(c.env)) {
      return c.json({ message: "Not found." }, 404)
    }
    if (
      !workspaceIdFromContext(c) &&
      !isLegacyMailRoutesEnabled(c.env) &&
      !c.req.path.endsWith("/oauth/google/callback") &&
      !c.req.path.endsWith("/google/pubsub")
    ) {
      return c.json({ message: "Not found." }, 404)
    }
    await next()
  } finally {
    c.header("Cache-Control", "private, no-store, max-age=0")
    c.header("Pragma", "no-cache")
    c.header("Referrer-Policy", "no-referrer")
    c.header("X-Content-Type-Options", "nosniff")
  }
})

mailRoutes.get("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const workspaceId = workspaceIdFromContext(c)
  if (workspaceId) {
    const membership = await requireWorkspaceMember(c, workspaceId, user.id)
    if (membership instanceof Response) return membership
    const [result] = await db
      .select({ account: gmailAccount, binding: gmailWorkspaceConnection })
      .from(gmailWorkspaceConnection)
      .innerJoin(
        gmailAccount,
        eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
      )
      .where(and(
        eq(gmailWorkspaceConnection.workspaceId, workspaceId),
        eq(gmailWorkspaceConnection.userId, user.id),
      ))
      .limit(1)
    return c.json({
      accountId: result?.account.id ?? null,
      bindingId: result?.binding.id ?? null,
      connectionId: result?.account.id ?? null,
      email: result?.account.email ?? null,
      mailboxReady: Boolean(result),
      mailboxRevision: result?.account.mailboxRevision ?? 0,
      providerConfigured: gmailProviderConfigured(c.env),
      status: result?.account.status ?? "disconnected",
      watchExpiresAt: result?.account.watchExpiresAt?.toISOString() ?? null,
      workspaceId,
    })
  }
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
  const workspaceId = workspaceIdFromContext(c)
  if (workspaceId) {
    const membership = await requireWorkspaceMember(c, workspaceId, user.id)
    if (membership instanceof Response) return membership
  }
  if (!gmailProviderConfigured(c.env)) {
    return c.json({ message: "Gmail is not configured on this server." }, 503)
  }
  const body = (await c.req.json().catch(() => ({}))) as { client?: unknown }
  if (body.client !== "web" && body.client !== "desktop") {
    return c.json({ message: "A valid Gmail client is required." }, 400)
  }
  try {
    const authorizationUrl = await beginGmailOauth(c.env, {
      clientKind: body.client,
      userId: user.id,
      ...(workspaceId ? { workspaceId } : {}),
    })
    await recordMailMetric("oauth_outcome", { outcome: "success" })
    return c.json({
      authorizationUrl,
    })
  } catch (error) {
    await recordMailMetric("oauth_outcome", { outcome: "failure" })
    return oauthError(c, error)
  }
})

mailRoutes.get("/oauth/google/callback", async (c) => {
  c.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; navigate-to 'self' zilobase:")
  const state = c.req.query("state")
  const code = c.req.query("code")
  if (!state || !code || c.req.query("error")) {
    await recordMailMetric("oauth_outcome", { outcome: "failure" })
    return c.html(renderOauthResult("Gmail connection was cancelled."), 400)
  }
  try {
    const result = await runWithDbEnv(c.env, async () => {
      const completed = await completeGmailOauth(c.env, { code, state })
      await recordMailMetric("oauth_outcome", { connectionId: completed.connectionId, outcome: "success" })
      const [account] = await db
        .select()
        .from(gmailAccount)
        .where(eq(gmailAccount.id, completed.connectionId))
        .limit(1)
      if (account) {
        await ensureMailIndexState(account.id)
        await initializeGmailWatch(c.env, account).catch(async (error) => {
          await db
            .update(gmailAccount)
            .set({
              lastErrorCode: error instanceof GmailApiError ? error.code : "watch_failed",
              updatedAt: new Date(),
            })
            .where(eq(gmailAccount.id, account.id))
        })
      }
      return completed
    })
    if (result.clientKind === "desktop") {
      const discovery = await getZilobaseDiscoveryDocument(c.env)
      const deepLink = buildDesktopMailReturnUrl(discovery)
      return c.html(renderOauthResult("Gmail connected. Return to Zilobase Desktop.", deepLink.toString()))
    }
    const target = new URL("/mail?connection=success", getCanonicalWebOrigin(c.env))
    return c.redirect(target.toString())
  } catch (error) {
    await recordMailMetric("oauth_outcome", { outcome: "failure" })
    return c.html(
      renderOauthResult(error instanceof Error ? error.message : "Gmail could not be connected."),
      error instanceof GmailOauthError ? (error.status as 400) : 500,
    )
  }
})

mailRoutes.delete("/connection", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const workspaceId = workspaceIdFromContext(c)
  if (workspaceId) {
    const membership = await requireWorkspaceMember(c, workspaceId, user.id)
    if (membership instanceof Response) return membership
    const [binding] = await db
      .select({ account: gmailAccount, binding: gmailWorkspaceConnection })
      .from(gmailWorkspaceConnection)
      .innerJoin(
        gmailAccount,
        eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
      )
      .where(and(
        eq(gmailWorkspaceConnection.workspaceId, workspaceId),
        eq(gmailWorkspaceConnection.userId, user.id),
      ))
      .limit(1)
    if (binding) {
      await db
        .delete(gmailWorkspaceConnection)
        .where(eq(gmailWorkspaceConnection.id, binding.binding.id))
      const [remaining] = await db
        .select({ value: count() })
        .from(gmailWorkspaceConnection)
        .where(eq(gmailWorkspaceConnection.gmailAccountId, binding.account.id))
      if (Number(remaining?.value ?? 0) === 0) {
        try {
          await (await createGmailGateway(c.env, binding.account)).stop()
        } catch {
          // Local disconnect remains authoritative when Gmail is unavailable.
        }
        await revokeGmailConnection(c.env, binding.account)
        clearGmailAccessTokenCache(binding.account.id)
        await db.delete(gmailAccount).where(eq(gmailAccount.id, binding.account.id))
      }
    }
    return c.json({ success: true })
  }
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.userId, user.id))
    .limit(1)
  if (connection) {
    await stopGmailWatch(c.env, connection)
    await revokeGmailConnection(c.env, connection)
    clearGmailAccessTokenCache(connection.id)
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
    await recordMailMetric("webhook_rejection", { status })
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

mailRoutes.get("/views", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    const [views, index] = await Promise.all([
      listMailViews(owned.bindingId),
      getMailIndexProgress(owned.connection.id),
    ])
    return c.json({
      index,
      systemFolders: mailSystemFolderIds,
      views,
    })
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailRoutes.get("/views/:viewId/database-sync-status", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json(await getMailDatabaseSyncViewStatus(owned.bindingId, c.req.param("viewId")))
  } catch (error) {
    if (error instanceof MailDatabaseSyncPausedError) return c.json({ message: error.message }, 404)
    throw error
  }
})

mailRoutes.get("/reminders", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return c.json({ reminders: await listMailReminders(owned.bindingId) })
})

mailRoutes.post("/threads/:threadId/remind", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  const body = (await c.req.json().catch(() => null)) as { remindAt?: unknown } | null
  if (!threadId || !body || typeof body.remindAt !== "string") return c.json({ message: "A valid mail reminder is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    try {
      return c.json({ reminder: await scheduleMailReminder({ bindingId: owned.bindingId, gateway, remindAt: new Date(body.remindAt as string), threadId }) }, 201)
    } catch (error) {
      if (error instanceof MailReminderError) return c.json({ message: error.message }, error.status)
      throw error
    }
  })
})

mailRoutes.delete("/reminders/:reminderId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try { return c.json(await cancelMailReminder(owned.bindingId, c.req.param("reminderId"))) }
  catch (error) { if (error instanceof MailReminderError) return c.json({ message: error.message }, error.status); throw error }
})

mailRoutes.post("/reminders/advance", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => c.json(await advanceMailReminders({
    bindingId: owned.bindingId,
    connectionId: owned.connection.id,
    env: c.env,
    gateway,
    userId: owned.userId,
    workspaceId: owned.workspaceId,
  })))
})

mailRoutes.post("/threads/:threadId/unsubscribe", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  if (!threadId) return c.json({ message: "A valid Gmail thread ID is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    try { return c.json(await inspectOrExecuteUnsubscribe(await gateway.getThread(threadId, "metadata"))) }
    catch (error) {
      if (error instanceof MailUnsubscribeError) return c.json({ message: error.message }, error.status)
      throw error
    }
  })
})

mailRoutes.get("/index/status", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return c.json({ index: await getMailIndexProgress(owned.connection.id) })
})

mailRoutes.post("/index/advance", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    const index = await advanceMailIndex(c.env, owned.connection.id)
    const databaseSync = await drainMailDatabaseSyncOutbox(c.env, { bindingId: owned.bindingId, limit: 10 })
    return c.json({ databaseSync, index })
  } catch (error) {
    if (error instanceof GmailApiError) {
      const status = error.status === 401 ? 401 : error.status === 429 ? 429 : 502
      return c.json({ message: error.message }, status)
    }
    throw error
  }
})

mailRoutes.post("/query", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (
    !body ||
    typeof body.routeId !== "string" ||
    !body.routeId ||
    body.routeId.length > 200 ||
    (body.cursor !== undefined && typeof body.cursor !== "string") ||
    (body.filter !== undefined && (!body.filter || typeof body.filter !== "object")) ||
    (body.groupKey !== undefined && (typeof body.groupKey !== "string" || body.groupKey.length > 500)) ||
    (body.limit !== undefined && (!Number.isInteger(body.limit) || Number(body.limit) < 1 || Number(body.limit) > 100)) ||
    (body.search !== undefined && (typeof body.search !== "string" || body.search.length > 500))
  ) {
    return c.json({ message: "A valid indexed mail query is required." }, 400)
  }
  try {
    return c.json(await queryIndexedMail({
      bindingId: owned.bindingId,
      ...(typeof body.cursor === "string" ? { cursor: body.cursor } : {}),
      env: c.env,
      ...(body.filter !== undefined ? { filter: normalizeMailFilterExpression(body.filter) } : {}),
      gmailAccountId: owned.connection.id,
      ...(typeof body.groupKey === "string" ? { groupKey: body.groupKey } : {}),
      ...(typeof body.limit === "number" ? { limit: body.limit } : {}),
      routeId: body.routeId,
      ...(typeof body.search === "string" ? { search: body.search } : {}),
    }))
  } catch (error) {
    if (error instanceof MailQueryError) {
      return c.json({ message: error.message }, error.status)
    }
    throw error
  }
})

mailRoutes.post("/query/groups", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (
    !body ||
    typeof body.routeId !== "string" ||
    !body.routeId ||
    body.routeId.length > 200 ||
    (body.filter !== undefined && (!body.filter || typeof body.filter !== "object")) ||
    (body.search !== undefined && (typeof body.search !== "string" || body.search.length > 500))
  ) return c.json({ message: "A valid grouped mail query is required." }, 400)
  try {
    return c.json(await queryIndexedMailGroups({
      bindingId: owned.bindingId,
      env: c.env,
      ...(body.filter !== undefined ? { filter: normalizeMailFilterExpression(body.filter) } : {}),
      gmailAccountId: owned.connection.id,
      routeId: body.routeId,
      ...(typeof body.search === "string" ? { search: body.search } : {}),
    }))
  } catch (error) {
    if (error instanceof MailQueryError) return c.json({ message: error.message }, error.status)
    throw error
  }
})

mailRoutes.get("/properties", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return c.json(await listMailProperties(owned.bindingId, owned.workspaceId))
})

mailRoutes.post("/properties", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    const property = await createMailProperty({
      bindingId: owned.bindingId,
      value: await c.req.json().catch(() => null),
    })
    return c.json({ property }, 201)
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailRoutes.patch("/properties/:propertyId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json({ property: await updateMailProperty({
      bindingId: owned.bindingId,
      propertyId: c.req.param("propertyId"),
      value: await c.req.json().catch(() => null),
    }) })
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailRoutes.delete("/properties/:propertyId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json(await deleteMailProperty({ bindingId: owned.bindingId, propertyId: c.req.param("propertyId") }))
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailRoutes.get("/threads/:threadId/properties", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json({ values: await listMailThreadPropertyValues({
      bindingId: owned.bindingId,
      gmailAccountId: owned.connection.id,
      threadId: c.req.param("threadId"),
    }) })
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailRoutes.put("/threads/:threadId/properties/:propertyId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || !Object.hasOwn(body, "value")) return c.json({ message: "A property value is required." }, 400)
  try {
    return c.json({ value: await setMailThreadPropertyValue({
      bindingId: owned.bindingId,
      gmailAccountId: owned.connection.id,
      propertyId: c.req.param("propertyId"),
      threadId: c.req.param("threadId"),
      value: body.value,
      workspaceId: owned.workspaceId,
    }) })
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailRoutes.post("/views", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (
    !body ||
    !optionalMailViewName(body.name) ||
    !optionalMailViewIcon(body.icon) ||
    (body.config !== undefined && (!body.config || typeof body.config !== "object"))
  ) {
    return c.json({ message: "A valid mail view is required." }, 400)
  }
  const templateId = body.templateId === undefined
    ? undefined
    : mailViewTemplateIds.includes(body.templateId as MailViewTemplateId)
      ? body.templateId as MailViewTemplateId
      : null
  if (templateId === null) return c.json({ message: "Unknown mail view template." }, 400)
  try {
    const view = await createMailView({
      bindingId: owned.bindingId,
      userId: owned.userId,
      value: {
        ...(body.config !== undefined ? { config: body.config as MailViewConfig } : {}),
        ...(body.icon !== undefined ? { icon: body.icon as string | null } : {}),
        ...(body.name !== undefined ? { name: body.name as string } : {}),
        ...(templateId ? { templateId } : {}),
      },
      workspaceId: owned.workspaceId,
    })
    return c.json({ view }, 201)
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailRoutes.put("/views/reorder", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await c.req.json().catch(() => null)) as { viewIds?: unknown } | null
  if (
    !body ||
    !Array.isArray(body.viewIds) ||
    body.viewIds.length > 100 ||
    !body.viewIds.every((id): id is string => typeof id === "string" && Boolean(id))
  ) {
    return c.json({ message: "A valid mail view order is required." }, 400)
  }
  try {
    return c.json({
      views: await reorderMailViews({
        bindingId: owned.bindingId,
        viewIds: body.viewIds,
      }),
    })
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailRoutes.post("/views/:viewId/duplicate", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    const view = await duplicateMailView({
      bindingId: owned.bindingId,
      userId: owned.userId,
      viewId: c.req.param("viewId"),
      workspaceId: owned.workspaceId,
    })
    return c.json({ view }, 201)
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailRoutes.patch("/views/:viewId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (
    !body ||
    !optionalMailViewName(body.name) ||
    !optionalMailViewIcon(body.icon) ||
    (body.config !== undefined && (!body.config || typeof body.config !== "object"))
  ) {
    return c.json({ message: "A valid mail view update is required." }, 400)
  }
  try {
    const view = await updateMailView({
      bindingId: owned.bindingId,
      userId: owned.userId,
      value: {
        ...(body.config !== undefined ? { config: body.config as MailViewConfig } : {}),
        ...(body.icon !== undefined ? { icon: body.icon as string | null } : {}),
        ...(body.name !== undefined ? { name: body.name as string } : {}),
      },
      viewId: c.req.param("viewId"),
      workspaceId: owned.workspaceId,
    })
    return c.json({ view })
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailRoutes.delete("/views/:viewId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json(await deleteMailView({
      bindingId: owned.bindingId,
      viewId: c.req.param("viewId"),
    }))
  } catch (error) {
    return mailViewError(c, error)
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
    {
      const startedAt = performance.now()
      const response = await synchronizeMailbox(gateway, body as MailSyncRequest, owned.connection.mailboxRevision)
      await recordMailMetric(response.mode === "recovery" ? "cursor_reset" : "sync", {
        connectionId: owned.connection.id,
        durationMs: performance.now() - startedAt,
        mode: response.mode,
        outcome: "success",
      })
      return c.json(response)
    },
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
        "content-disposition": "attachment",
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
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

mailRoutes.post("/drafts", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const compose = parseCompose(c, await c.req.json().catch(() => null), false)
  if (compose instanceof Response) return compose
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await createGmailDraft(gateway, owned.connection, compose), 201),
  )
})

mailRoutes.put("/drafts/:draftId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const draftId = safeGmailId(c.req.param("draftId"))
  const compose = parseCompose(c, await c.req.json().catch(() => null), false)
  if (!draftId || compose instanceof Response) {
    return compose instanceof Response ? compose : c.json({ message: "A valid Gmail draft ID is required." }, 400)
  }
  if (compose.draftId && compose.draftId !== draftId) return c.json({ message: "The Gmail draft ID does not match." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await updateGmailDraft(gateway, owned.connection, draftId, compose)),
  )
})

mailRoutes.delete("/drafts/:draftId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const draftId = safeGmailId(c.req.param("draftId"))
  if (!draftId) return c.json({ message: "A valid Gmail draft ID is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.deleteDraft(draftId)
    return c.body(null, 204)
  })
})

mailRoutes.post("/drafts/:draftId/send", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const draftId = safeGmailId(c.req.param("draftId"))
  const compose = parseCompose(c, await c.req.json().catch(() => null), true)
  if (!draftId || compose instanceof Response) {
    return compose instanceof Response ? compose : c.json({ message: "A valid Gmail draft ID is required." }, 400)
  }
  if (compose.draftId && compose.draftId !== draftId) return c.json({ message: "The Gmail draft ID does not match." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await updateGmailDraft(gateway, owned.connection, draftId, compose)
    return c.json(await sendGmailComposition({
      compose,
      connection: owned.connection,
      draftId,
      gateway,
      userId: owned.userId,
    }))
  })
})

mailRoutes.post("/send", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const compose = parseCompose(c, await c.req.json().catch(() => null), true)
  if (compose instanceof Response) return compose
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await sendGmailComposition({
      compose,
      connection: owned.connection,
      gateway,
      userId: owned.userId,
    })),
  )
})

mailRoutes.post("/realtime-ticket", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const ticket = await createMailRealtimeTicket({
    bindingId: owned.bindingId,
    connectionId: owned.connection.id,
    userId: owned.userId,
    workspaceId: owned.workspaceId,
  }, c.env)
  const websocketUrl = new URL(getMailRealtimeWebSocketUrl(c.req.raw, c.env))
  websocketUrl.searchParams.set("binding", owned.bindingId)
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
  const workspaceId = workspaceIdFromContext(c)
  if (workspaceId) {
    const membership = await requireWorkspaceMember(c, workspaceId, user.id)
    if (membership instanceof Response) return membership
    const [owned] = await db
      .select({ bindingId: gmailWorkspaceConnection.id, connection: gmailAccount })
      .from(gmailWorkspaceConnection)
      .innerJoin(
        gmailAccount,
        eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
      )
      .where(and(
        eq(gmailWorkspaceConnection.workspaceId, workspaceId),
        eq(gmailWorkspaceConnection.userId, user.id),
        eq(gmailAccount.userId, user.id),
      ))
      .limit(1)
    if (!owned) return c.json({ message: "Connect Gmail to continue." }, 409)
    if (owned.connection.status !== "connected") {
      return c.json({ message: "Reconnect Gmail to continue." }, 409)
    }
    return {
      bindingId: owned.bindingId,
      connection: owned.connection,
      userId: user.id,
      workspaceId,
    }
  }
  const [connection] = await db
    .select()
    .from(gmailConnection)
    .where(eq(gmailConnection.userId, user.id))
    .limit(1)
  if (!connection) return c.json({ message: "Connect Gmail to continue." }, 409)
  if (connection.status !== "connected") return c.json({ message: "Reconnect Gmail to continue." }, 409)
  return {
    bindingId: `legacy:${connection.id}`,
    connection,
    userId: user.id,
    workspaceId: "legacy",
  }
}

async function requireWorkspaceMailBinding(c: Context<AppBindings>) {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  if (owned.workspaceId === "legacy") {
    return c.json({ message: "Workspace mail views are not available on legacy routes." }, 404)
  }
  return owned
}

function optionalMailViewName(value: unknown) {
  return value === undefined || (
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120
  )
}

function optionalMailViewIcon(value: unknown) {
  return value === undefined || value === null || (
    typeof value === "string" && value.trim().length <= 80
  )
}

function mailViewError(c: Context<AppBindings>, error: unknown) {
  if (error instanceof MailViewServiceError) {
    return c.json({ message: error.message }, error.status)
  }
  throw error
}

function mailPropertyError(c: Context<AppBindings>, error: unknown) {
  if (error instanceof MailPropertyError) return c.json({ message: error.message }, error.status)
  throw error
}

async function runMailOperation(
  c: Context<AppBindings>,
  userId: string,
  connection: typeof gmailAccount.$inferSelect | typeof gmailConnection.$inferSelect,
  operation: (gateway: Awaited<ReturnType<typeof createGmailGateway>>) => Promise<Response>,
) {
  try {
    return await withMailUserConcurrency(userId, async () => {
      const gateway = await createGmailGateway(c.env, connection)
      return operation(gateway)
    })
  } catch (error) {
    if (error instanceof GmailApiError && error.code === "quota_exceeded") {
      await recordMailMetric("quota_failure", { connectionId: connection.id, code: error.code, status: error.status })
    }
    if (error instanceof GmailApiError && error.code === "authorization_revoked") {
      clearGmailAccessTokenCache(connection.id)
      const update = { lastErrorCode: error.code, status: "reconnect_required", updatedAt: new Date() }
      await Promise.all([
        db.update(gmailAccount).set(update).where(eq(gmailAccount.id, connection.id)),
        db.update(gmailConnection).set(update).where(eq(gmailConnection.id, connection.id)),
      ])
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

function workspaceIdFromContext(c: Context<AppBindings>) {
  const workspaceId = c.req.param("workspaceId")
  return workspaceId && /^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)
    ? workspaceId
    : null
}

async function requireWorkspaceMember(
  c: Context<AppBindings>,
  workspaceId: string,
  userId: string,
) {
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(
      eq(member.organizationId, workspaceId),
      eq(member.userId, userId),
    ))
    .limit(1)
  return membership ?? c.json({ message: "Workspace membership is required." }, 403)
}

function statusCode(status: number): 400 | 401 | 404 | 409 | 429 | 500 | 502 | 504 {
  return [400, 401, 404, 409, 429, 500, 502, 504].includes(status)
    ? status as 400 | 401 | 404 | 409 | 429 | 500 | 502 | 504
    : 500
}

function safeGmailId(value: string) {
  return /^[A-Za-z0-9_-]{1,512}$/.test(value) ? value : null
}

function parseCompose(c: Context<AppBindings>, value: unknown, requireRecipient: boolean) {
  try {
    return parseMailComposeRequest(value, { requireRecipient })
  } catch (error) {
    return c.json({ message: error instanceof MailComposeError ? error.message : "A valid mail composition is required." }, 400)
  }
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
  return ["all_mail", "archive", "bin", "drafts", "inbox", "sent", "spam", "starred", "trash", "unread"].includes(value as string)
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
