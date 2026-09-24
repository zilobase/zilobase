import { Hono } from "hono";
import {
  isIndexedQueryBody,
  isGroupedQueryBody,
  indexedQueryOptions,
  groupedQueryOptions,
} from "./query-input";
import { type MailSyncRequest } from "@zilobase/features/mail/contracts";
import type { AppBindings } from "../../../shared/types";
import { readJsonBody } from "../../../shared/http/request";
import { GmailApiError } from "../provider/gmail-gateway";
import { recordMailMetric } from "../mail-metrics";
import { synchronizeMailbox } from "../sync/mail-sync";
import { advanceMailIndex, getMailIndexProgress } from "./mail-index";
import { MailQueryError, queryIndexedMail, queryIndexedMailGroups } from "./mail-query";
import {
  inspectOrExecuteUnsubscribeHeaders,
  MailUnsubscribeError,
} from "../compose/safe-unsubscribe";
import { loadMailboxUnsubscribeHeaders } from "../sync/mailbox-store";
import { drainMailDatabaseSyncOutbox } from "../database-sync/mail-database-sync-worker";
import {
  requireOwnedConnection,
  requireWorkspaceMailBinding,
  runMailOperation,
  safeGmailId,
  optionalCursor,
  optionalQuery,
  optionalIdList,
  isMailView,
} from "../route-support";

export const mailQueryRoutes = new Hono<AppBindings>();
export const mailSyncRoutes = new Hono<AppBindings>();

mailQueryRoutes.post("/threads/:threadId/unsubscribe", async (c) => {
  const owned = await requireWorkspaceMailBinding(c);
  if (owned instanceof Response) return owned;
  const threadId = safeGmailId(c.req.param("threadId"));
  if (!threadId) return c.json({ message: "A valid Gmail thread ID is required." }, 400);
  try {
    const headers = await loadMailboxUnsubscribeHeaders(owned.connection.id, threadId);
    if (!headers) return c.json({ message: "Mail thread not found." }, 404);
    return c.json(await inspectOrExecuteUnsubscribeHeaders(headers));
  } catch (error) {
    if (error instanceof MailUnsubscribeError)
      return c.json({ message: error.message }, error.status);
    throw error;
  }
});

mailQueryRoutes.get("/index/status", async (c) => {
  const owned = await requireWorkspaceMailBinding(c);
  if (owned instanceof Response) return owned;
  return c.json({ index: await getMailIndexProgress(owned.connection.id) });
});

mailQueryRoutes.post("/index/advance", async (c) => {
  const owned = await requireWorkspaceMailBinding(c);
  if (owned instanceof Response) return owned;
  try {
    const index = await advanceMailIndex(c.env, owned.connection.id);
    const databaseSync = await drainMailDatabaseSyncOutbox(c.env, {
      bindingId: owned.bindingId,
      limit: 10,
    });
    return c.json({ databaseSync, index });
  } catch (error) {
    if (error instanceof GmailApiError) {
      const status = error.status === 401 ? 401 : error.status === 429 ? 429 : 502;
      return c.json({ message: error.message }, status);
    }
    throw error;
  }
});

mailQueryRoutes.post("/query", async (c) => {
  const owned = await requireWorkspaceMailBinding(c);
  if (owned instanceof Response) return owned;
  const body = (await readJsonBody(c.req)) as Record<string, unknown> | null;
  if (!isIndexedQueryBody(body)) {
    return c.json({ message: "A valid indexed mail query is required." }, 400);
  }
  try {
    return c.json(
      await queryIndexedMail({
        bindingId: owned.bindingId,
        env: c.env,
        gmailAccountId: owned.connection.id,
        ...indexedQueryOptions(body),
      }),
    );
  } catch (error) {
    if (error instanceof MailQueryError) {
      return c.json({ message: error.message }, error.status);
    }
    throw error;
  }
});

mailQueryRoutes.post("/query/groups", async (c) => {
  const owned = await requireWorkspaceMailBinding(c);
  if (owned instanceof Response) return owned;
  const body = (await readJsonBody(c.req)) as Record<string, unknown> | null;
  if (!isGroupedQueryBody(body))
    return c.json({ message: "A valid grouped mail query is required." }, 400);
  try {
    return c.json(
      await queryIndexedMailGroups({
        bindingId: owned.bindingId,
        env: c.env,
        gmailAccountId: owned.connection.id,
        ...groupedQueryOptions(body),
      }),
    );
  } catch (error) {
    if (error instanceof MailQueryError) return c.json({ message: error.message }, error.status);
    throw error;
  }
});

mailSyncRoutes.post("/sync", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const body = (await readJsonBody(c.req)) as Partial<MailSyncRequest> | null;
  if (!body || body.connectionId !== owned.connection.id || !isMailView(body.view)) {
    return c.json({ message: "A valid mail synchronization request is required." }, 400);
  }
  if (
    !optionalCursor(body.historyId) ||
    !optionalCursor(body.pageToken) ||
    !optionalQuery(body.query) ||
    !optionalIdList(body.knownMessageIds) ||
    !optionalIdList(body.knownThreadIds)
  ) {
    return c.json({ message: "The mail synchronization cursor is invalid." }, 400);
  }
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const startedAt = performance.now();
    const response = await synchronizeMailbox(
      gateway,
      body as MailSyncRequest,
      owned.connection.mailboxRevision,
    );
    await recordMailMetric(response.mode === "recovery" ? "cursor_reset" : "sync", {
      connectionId: owned.connection.id,
      durationMs: performance.now() - startedAt,
      mode: response.mode,
      outcome: "success",
    });
    return c.json(response);
  });
});
