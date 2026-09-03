import { Hono } from "hono";
import { normalizeMailFilterExpression, type MailSyncRequest } from "@zilobase/features/mail";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { GmailApiError } from "./gmail-gateway";
import { recordMailMetric } from "./mail-metrics";
import { synchronizeMailbox } from "./mail-sync";
import { advanceMailIndex, getMailIndexProgress } from "./mail-index";
import { MailQueryError, queryIndexedMail, queryIndexedMailGroups } from "./mail-query";
import { inspectOrExecuteUnsubscribe, MailUnsubscribeError } from "./safe-unsubscribe";
import { drainMailDatabaseSyncOutbox } from "./mail-database-sync-worker";
import { requireOwnedConnection, requireWorkspaceMailBinding, runMailOperation, safeGmailId, optionalCursor, optionalQuery, optionalIdList, isMailView } from "./route-support";

export const mailQueryRoutes = new Hono<AppBindings>();
export const mailSyncRoutes = new Hono<AppBindings>();

mailQueryRoutes.post("/threads/:threadId/unsubscribe", async (c) => {
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

mailQueryRoutes.get("/index/status", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return c.json({ index: await getMailIndexProgress(owned.connection.id) })
})

mailQueryRoutes.post("/index/advance", async (c) => {
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

mailQueryRoutes.post("/query", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await readJsonBody(c.req)) as Record<string, unknown> | null
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

mailQueryRoutes.post("/query/groups", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await readJsonBody(c.req)) as Record<string, unknown> | null
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


mailSyncRoutes.post("/sync", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = (await readJsonBody(c.req)) as Partial<MailSyncRequest> | null
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

