import { Hono } from "hono";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { GmailApiError } from "./gmail-gateway";
import { createGmailDraft, sendGmailComposition, updateGmailDraft } from "./mail-compose";
import { normalizeGmailLabels, normalizeGmailMessage, normalizeGmailThread } from "./mail-normalize";
import { requireOwnedConnection, runMailOperation, safeGmailId, parseCompose, safeUserLabelId, parseMailActionRequest, parseMailBatchModifyRequest, parseMailLabelWriteRequest, parseMailModifyRequest } from "./route-support";

export const mailMessageRoutes = new Hono<AppBindings>();

mailMessageRoutes.get("/threads/:threadId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  if (!threadId) return c.json({ message: "A valid Gmail thread ID is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const record = normalizeGmailThread(await gateway.getThread(threadId, "full"), true)
    return c.json({ messages: record.messages, thread: record.summary })
  })
})

mailMessageRoutes.get("/messages/:messageId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const messageId = safeGmailId(c.req.param("messageId"))
  if (!messageId) return c.json({ message: "A valid Gmail message ID is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json({ message: normalizeGmailMessage(await gateway.getMessage(messageId, "full"), true) }),
  )
})

mailMessageRoutes.get("/messages/:messageId/attachments/:attachmentId", async (c) => {
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

mailMessageRoutes.get("/labels", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const result = await gateway.listLabels()
    return c.json({ labels: normalizeGmailLabels(result.labels ?? []) })
  })
})

mailMessageRoutes.post("/labels", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = parseMailLabelWriteRequest(await readJsonBody(c.req), true)
  if (!body) return c.json({ message: "A valid Gmail label is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const label = normalizeGmailLabels([await gateway.createLabel(body)])[0]
    if (!label) throw new GmailApiError("Gmail returned an invalid label.", 502, "provider_error")
    return c.json({ label })
  })
})

mailMessageRoutes.patch("/labels/:labelId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const labelId = safeUserLabelId(c.req.param("labelId"))
  const body = parseMailLabelWriteRequest(await readJsonBody(c.req), false)
  if (!labelId || !body) return c.json({ message: "A valid Gmail label update is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    const label = normalizeGmailLabels([await gateway.updateLabel(labelId, body)])[0]
    if (!label) throw new GmailApiError("Gmail returned an invalid label.", 502, "provider_error")
    return c.json({ label })
  })
})

mailMessageRoutes.delete("/labels/:labelId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const labelId = safeUserLabelId(c.req.param("labelId"))
  if (!labelId) return c.json({ message: "A valid Gmail label is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.deleteLabel(labelId)
    return c.json({ deletedId: labelId })
  })
})

mailMessageRoutes.post("/threads/batch-modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = parseMailBatchModifyRequest(await readJsonBody(c.req), 50)
  if (!body) return c.json({ message: "A valid thread batch modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.batchModifyThreads(body.ids, body)
    return c.json({ acceptedIds: body.ids })
  })
})

mailMessageRoutes.post("/messages/batch-modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const body = parseMailBatchModifyRequest(await readJsonBody(c.req), 1_000)
  if (!body) return c.json({ message: "A valid message batch modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.batchModifyMessages(body.ids, body)
    return c.json({ acceptedIds: body.ids })
  })
})

mailMessageRoutes.post("/threads/:threadId/modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  const body = parseMailModifyRequest(await readJsonBody(c.req))
  if (!threadId || !body) return c.json({ message: "A valid thread modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.modifyThread(threadId, body)
    const record = normalizeGmailThread(await gateway.getThread(threadId, "metadata"), false)
    return c.json({ messages: record.messages, thread: record.summary })
  })
})

mailMessageRoutes.post("/messages/:messageId/modify", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const messageId = safeGmailId(c.req.param("messageId"))
  const body = parseMailModifyRequest(await readJsonBody(c.req))
  if (!messageId || !body) return c.json({ message: "A valid message modification is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.modifyMessage(messageId, body)
    return c.json({ message: normalizeGmailMessage(await gateway.getMessage(messageId, "metadata"), false) })
  })
})

mailMessageRoutes.post("/threads/:threadId/action", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  const body = parseMailActionRequest(await readJsonBody(c.req))
  if (!threadId || !body) return c.json({ message: "A valid thread action is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    if (body.action === "trash") await gateway.trashThread(threadId)
    else await gateway.untrashThread(threadId)
    const record = normalizeGmailThread(await gateway.getThread(threadId, "metadata"), false)
    return c.json({ messages: record.messages, thread: record.summary })
  })
})

mailMessageRoutes.post("/messages/:messageId/action", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const messageId = safeGmailId(c.req.param("messageId"))
  const body = parseMailActionRequest(await readJsonBody(c.req))
  if (!messageId || !body) return c.json({ message: "A valid message action is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    if (body.action === "trash") await gateway.trashMessage(messageId)
    else await gateway.untrashMessage(messageId)
    return c.json({ message: normalizeGmailMessage(await gateway.getMessage(messageId, "metadata"), false) })
  })
})

mailMessageRoutes.post("/drafts", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const compose = parseCompose(c, await readJsonBody(c.req), false)
  if (compose instanceof Response) return compose
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await createGmailDraft(gateway, owned.connection, compose), 201),
  )
})

mailMessageRoutes.put("/drafts/:draftId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const draftId = safeGmailId(c.req.param("draftId"))
  const compose = parseCompose(c, await readJsonBody(c.req), false)
  if (!draftId || compose instanceof Response) {
    return compose instanceof Response ? compose : c.json({ message: "A valid Gmail draft ID is required." }, 400)
  }
  if (compose.draftId && compose.draftId !== draftId) return c.json({ message: "The Gmail draft ID does not match." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) =>
    c.json(await updateGmailDraft(gateway, owned.connection, draftId, compose)),
  )
})

mailMessageRoutes.delete("/drafts/:draftId", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const draftId = safeGmailId(c.req.param("draftId"))
  if (!draftId) return c.json({ message: "A valid Gmail draft ID is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    await gateway.deleteDraft(draftId)
    return c.body(null, 204)
  })
})

mailMessageRoutes.post("/drafts/:draftId/send", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const draftId = safeGmailId(c.req.param("draftId"))
  const compose = parseCompose(c, await readJsonBody(c.req), true)
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

mailMessageRoutes.post("/send", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const compose = parseCompose(c, await readJsonBody(c.req), true)
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

