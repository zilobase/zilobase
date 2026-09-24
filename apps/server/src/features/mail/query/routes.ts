import { Hono } from "hono";
import {
  isIndexedQueryBody,
  isGroupedQueryBody,
  indexedQueryOptions,
  groupedQueryOptions,
} from "./query-input";
import type { AppBindings } from "../../../shared/types";
import { readJsonBody } from "../../../shared/http/request";
import { getMailIndexProgress } from "./mail-index";
import { MailQueryError, queryIndexedMail, queryIndexedMailGroups } from "./mail-query";
import {
  inspectOrExecuteUnsubscribeHeaders,
  MailUnsubscribeError,
} from "../compose/safe-unsubscribe";
import { loadMailboxUnsubscribeHeaders } from "../sync/mailbox-store";
import { requireWorkspaceMailBinding, safeGmailId } from "../route-support";

export const mailQueryRoutes = new Hono<AppBindings>();

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
