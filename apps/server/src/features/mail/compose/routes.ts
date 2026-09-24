import { Hono } from "hono";
import type { AppBindings } from "../../../shared/types";
import { readJsonBody } from "../../../shared/http/request";
import { GmailApiError } from "../provider/gmail-gateway";
import {
  normalizeDraft,
  createGmailDraft,
  sendGmailComposition,
  updateGmailDraft,
} from "./mail-compose";
import { normalizeGmailLabels } from "../provider/mail-normalize";
import {
  applyMailboxLabelDelta,
  applyMailboxThreadLabelDelta,
  commitMailboxRevision,
  type MailboxChangeSet,
  deleteMailboxLabel,
  loadMailboxLabels,
  loadMailboxMessage,
  loadMailboxThread,
  upsertMailboxLabel,
} from "../sync/mailbox-store";
import { requestMailSync } from "../sync/mail-sync-coordinator";
import { publishMailIndexUpdate } from "../sync/mailbox-sync-engine";
import {
  requireOwnedConnection,
  runMailOperation,
  safeGmailId,
  parseCompose,
  safeUserLabelId,
  parseMailActionRequest,
  parseMailBatchModifyRequest,
  parseMailLabelWriteRequest,
  parseMailModifyRequest,
} from "../route-support";

export const mailMessageRoutes = new Hono<AppBindings>();

mailMessageRoutes.get("/threads/:threadId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const threadId = safeGmailId(c.req.param("threadId"));
  if (!threadId) return c.json({ message: "A valid Gmail thread ID is required." }, 400);
  const record = await loadMailboxThread(owned.connection.id, threadId);
  return record
    ? c.json({ messages: record.messages, thread: record.summary })
    : c.json({ message: "Mail thread not found." }, 404);
});

mailMessageRoutes.get("/messages/:messageId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const messageId = safeGmailId(c.req.param("messageId"));
  if (!messageId) return c.json({ message: "A valid Gmail message ID is required." }, 400);
  const message = await loadMailboxMessage(owned.connection.id, messageId);
  return message ? c.json({ message }) : c.json({ message: "Mail message not found." }, 404);
});

mailMessageRoutes.get("/messages/:messageId/attachments/:attachmentId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const messageId = safeGmailId(c.req.param("messageId"));
  const attachmentId = safeGmailId(c.req.param("attachmentId"));
  if (!messageId || !attachmentId)
    return c.json({ message: "A valid Gmail attachment is required." }, 400);
  const message = await loadMailboxMessage(owned.connection.id, messageId);
  if (!message?.attachments.some((attachment) => attachment.attachmentId === attachmentId))
    return c.json({ message: "Mail attachment not found." }, 404);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const upstream = await gateway.getAttachment(messageId, attachmentId);
    return new Response(upstream.body, {
      headers: {
        "cache-control": "private, max-age=86400",
        "content-disposition": "attachment",
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
      status: upstream.status,
    });
  });
});

mailMessageRoutes.get("/labels", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  return c.json({ labels: await loadMailboxLabels(owned.connection.id) });
});

mailMessageRoutes.post("/labels", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const body = parseMailLabelWriteRequest(await readJsonBody(c.req), true);
  if (!body) return c.json({ message: "A valid Gmail label is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const label = normalizeGmailLabels([await gateway.createLabel(body)])[0];
    if (!label) throw new GmailApiError("Gmail returned an invalid label.", 502, "provider_error");
    await upsertMailboxLabel(owned.connection.id, label);
    await commitAndReconcile(c.env, owned.connection.id, "label_created", undefined, {
      labelsChanged: true,
    });
    return c.json({ label });
  });
});

mailMessageRoutes.patch("/labels/:labelId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const labelId = safeUserLabelId(c.req.param("labelId"));
  const body = parseMailLabelWriteRequest(await readJsonBody(c.req), false);
  if (!labelId || !body) return c.json({ message: "A valid Gmail label update is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const label = normalizeGmailLabels([await gateway.updateLabel(labelId, body)])[0];
    if (!label) throw new GmailApiError("Gmail returned an invalid label.", 502, "provider_error");
    await upsertMailboxLabel(owned.connection.id, label);
    await commitAndReconcile(c.env, owned.connection.id, "label_updated", undefined, {
      labelsChanged: true,
    });
    return c.json({ label });
  });
});

mailMessageRoutes.delete("/labels/:labelId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const labelId = safeUserLabelId(c.req.param("labelId"));
  if (!labelId) return c.json({ message: "A valid Gmail label is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.deleteLabel(labelId);
    await deleteMailboxLabel(owned.connection.id, labelId);
    await commitAndReconcile(c.env, owned.connection.id, "label_deleted", undefined, {
      labelsChanged: true,
    });
    return c.json({ deletedId: labelId });
  });
});

mailMessageRoutes.post("/threads/batch-modify", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const body = parseMailBatchModifyRequest(await readJsonBody(c.req), 50);
  if (!body) return c.json({ message: "A valid thread batch modification is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.batchModifyThreads(body.ids, body);
    for (const threadId of body.ids)
      await applyMailboxThreadLabelDelta({
        ...body,
        gmailAccountId: owned.connection.id,
        gmailThreadId: threadId,
      });
    await commitAndReconcile(c.env, owned.connection.id, "thread_batch_modified", undefined, {
      threadIds: body.ids,
    });
    return c.json({ acceptedIds: body.ids });
  });
});

mailMessageRoutes.post("/messages/batch-modify", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const body = parseMailBatchModifyRequest(await readJsonBody(c.req), 1_000);
  if (!body) return c.json({ message: "A valid message batch modification is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.batchModifyMessages(body.ids, body);
    for (const messageId of body.ids)
      await applyMailboxLabelDelta({
        ...body,
        gmailAccountId: owned.connection.id,
        gmailMessageId: messageId,
      });
    await commitAndReconcile(c.env, owned.connection.id, "message_batch_modified", undefined, {
      messageIds: body.ids,
    });
    return c.json({ acceptedIds: body.ids });
  });
});

mailMessageRoutes.post("/threads/:threadId/modify", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const threadId = safeGmailId(c.req.param("threadId"));
  const body = parseMailModifyRequest(await readJsonBody(c.req));
  if (!threadId || !body)
    return c.json({ message: "A valid thread modification is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const result = await gateway.modifyThread(threadId, body);
    await applyMailboxThreadLabelDelta({
      ...body,
      gmailAccountId: owned.connection.id,
      gmailThreadId: threadId,
    });
    await commitAndReconcile(c.env, owned.connection.id, "thread_modified", result.historyId, {
      threadIds: [threadId],
    });
    const record = await loadMailboxThread(owned.connection.id, threadId);
    if (!record) return c.json({ message: "Mail thread not found." }, 404);
    return c.json({ messages: record.messages, thread: record.summary });
  });
});

mailMessageRoutes.post("/messages/:messageId/modify", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const messageId = safeGmailId(c.req.param("messageId"));
  const body = parseMailModifyRequest(await readJsonBody(c.req));
  if (!messageId || !body)
    return c.json({ message: "A valid message modification is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const result = await gateway.modifyMessage(messageId, body);
    await applyMailboxLabelDelta({
      ...body,
      gmailAccountId: owned.connection.id,
      gmailMessageId: messageId,
    });
    await commitAndReconcile(c.env, owned.connection.id, "message_modified", result.historyId, {
      messageIds: [messageId],
    });
    const message = await loadMailboxMessage(owned.connection.id, messageId);
    return message ? c.json({ message }) : c.json({ message: "Mail message not found." }, 404);
  });
});

mailMessageRoutes.post("/threads/:threadId/action", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const threadId = safeGmailId(c.req.param("threadId"));
  const body = parseMailActionRequest(await readJsonBody(c.req));
  if (!threadId || !body) return c.json({ message: "A valid thread action is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const result =
      body.action === "trash"
        ? await gateway.trashThread(threadId)
        : await gateway.untrashThread(threadId);
    await applyMailboxThreadLabelDelta({
      addLabelIds: body.action === "trash" ? ["TRASH"] : ["INBOX"],
      gmailAccountId: owned.connection.id,
      gmailThreadId: threadId,
      removeLabelIds: body.action === "trash" ? ["INBOX"] : ["TRASH"],
    });
    await commitAndReconcile(c.env, owned.connection.id, "thread_action", result.historyId, {
      threadIds: [threadId],
    });
    const record = await loadMailboxThread(owned.connection.id, threadId);
    if (!record) return c.json({ message: "Mail thread not found." }, 404);
    return c.json({ messages: record.messages, thread: record.summary });
  });
});

mailMessageRoutes.post("/messages/:messageId/action", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const messageId = safeGmailId(c.req.param("messageId"));
  const body = parseMailActionRequest(await readJsonBody(c.req));
  if (!messageId || !body) return c.json({ message: "A valid message action is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const result =
      body.action === "trash"
        ? await gateway.trashMessage(messageId)
        : await gateway.untrashMessage(messageId);
    await applyMailboxLabelDelta({
      addLabelIds: body.action === "trash" ? ["TRASH"] : ["INBOX"],
      gmailAccountId: owned.connection.id,
      gmailMessageId: messageId,
      removeLabelIds: body.action === "trash" ? ["INBOX"] : ["TRASH"],
    });
    await commitAndReconcile(c.env, owned.connection.id, "message_action", result.historyId, {
      messageIds: [messageId],
    });
    const message = await loadMailboxMessage(owned.connection.id, messageId);
    return message ? c.json({ message }) : c.json({ message: "Mail message not found." }, 404);
  });
});

async function commitAndReconcile(
  env: AppBindings["Bindings"],
  gmailAccountId: string,
  reason: string,
  historyId?: string,
  changes?: MailboxChangeSet,
) {
  await commitMailboxRevision(gmailAccountId, changes);
  await publishMailIndexUpdate(env, gmailAccountId);
  await requestMailSync(env, { gmailAccountId, historyId, reason });
}

mailMessageRoutes.get("/drafts", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const pageToken = c.req.query("pageToken");
  if (pageToken && pageToken.length > 2048)
    return c.json({ message: "Invalid draft cursor." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await gateway.listDrafts(pageToken)),
  );
});

mailMessageRoutes.get("/drafts/:draftId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const draftId = safeGmailId(c.req.param("draftId"));
  if (!draftId) return c.json({ message: "A valid Gmail draft ID is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(normalizeDraft(await gateway.getDraft(draftId))),
  );
});

mailMessageRoutes.post("/drafts", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const compose = parseCompose(c, await readJsonBody(c.req), false);
  if (compose instanceof Response) return compose;
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await createGmailDraft(gateway, owned.connection, compose), 201),
  );
});

mailMessageRoutes.put("/drafts/:draftId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const draftId = safeGmailId(c.req.param("draftId"));
  const compose = parseCompose(c, await readJsonBody(c.req), false);
  if (!draftId || compose instanceof Response) {
    return compose instanceof Response
      ? compose
      : c.json({ message: "A valid Gmail draft ID is required." }, 400);
  }
  if (compose.draftId && compose.draftId !== draftId)
    return c.json({ message: "The Gmail draft ID does not match." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await updateGmailDraft(gateway, owned.connection, draftId, compose)),
  );
});

mailMessageRoutes.delete("/drafts/:draftId", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const draftId = safeGmailId(c.req.param("draftId"));
  if (!draftId) return c.json({ message: "A valid Gmail draft ID is required." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.deleteDraft(draftId);
    return c.body(null, 204);
  });
});

mailMessageRoutes.post("/drafts/:draftId/send", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const draftId = safeGmailId(c.req.param("draftId"));
  const compose = parseCompose(c, await readJsonBody(c.req), true);
  if (!draftId || compose instanceof Response) {
    return compose instanceof Response
      ? compose
      : c.json({ message: "A valid Gmail draft ID is required." }, 400);
  }
  if (compose.draftId && compose.draftId !== draftId)
    return c.json({ message: "The Gmail draft ID does not match." }, 400);
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const sent = await sendGmailComposition({
      compose,
      connection: owned.connection,
      draftId,
      gateway,
      userId: owned.userId,
    });
    await requestMailSync(c.env, {
      gmailAccountId: owned.connection.id,
      reason: "draft_sent",
    });
    return c.json(sent);
  });
});

mailMessageRoutes.post("/send", async (c) => {
  const owned = await requireOwnedConnection(c);
  if (owned instanceof Response) return owned;
  const compose = parseCompose(c, await readJsonBody(c.req), true);
  if (compose instanceof Response) return compose;
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const sent = await sendGmailComposition({
      compose,
      connection: owned.connection,
      gateway,
      userId: owned.userId,
    });
    await requestMailSync(c.env, {
      gmailAccountId: owned.connection.id,
      reason: "message_sent",
    });
    return c.json(sent);
  });
});
