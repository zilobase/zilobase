import assert from "node:assert/strict"
import { test } from "vitest"

import {
  accessTokenFromRefresh,
  decodeGmailAttachmentResponse,
  GmailApiError,
  GmailGateway,
} from "./gmail-gateway"

test("safe Gmail reads retry transient failures and preserve pagination parameters", async () => {
  const requests: URL[] = []
  const gateway = new GmailGateway("access-token", async (input) => {
    requests.push(new URL(input instanceof Request ? input.url : input.toString()))
    if (requests.length === 1) return new Response("unavailable", { status: 503 })
    return Response.json({ nextPageToken: "next", threads: [] })
  })

  const result = await gateway.listThreads({ labelIds: ["INBOX"], maxResults: 50, pageToken: "page" })
  assert.equal(requests.length, 2)
  assert.equal(requests[1]?.searchParams.get("labelIds"), "INBOX")
  assert.equal(requests[1]?.searchParams.get("pageToken"), "page")
  assert.equal(result.nextPageToken, "next")
})

test("history 404 and quota responses are normalized without provider response contents", async () => {
  const history = new GmailGateway("token", async () => new Response("provider details", { status: 404 }))
  await assert.rejects(
    history.listHistory({ startHistoryId: "old" }),
    (error: unknown) => error instanceof GmailApiError && error.code === "history_cursor_invalid",
  )

  const quota = new GmailGateway("token", async () => new Response("provider details", { status: 429 }))
  await assert.rejects(
    quota.listLabels(),
    (error: unknown) => error instanceof GmailApiError && error.code === "quota_exceeded" && !error.message.includes("provider details"),
  )
})

test("refresh-token invalidation is classified as a required reconnect", () => {
  assert.throws(
    () => accessTokenFromRefresh(400, { error: "invalid_grant" }),
    (error: unknown) => error instanceof GmailApiError && error.code === "authorization_revoked" && error.status === 401,
  )
  assert.equal(accessTokenFromRefresh(200, { access_token: "short-lived-access" }), "short-lived-access")
})

test("watch creation and stop use Gmail's mailbox lifecycle endpoints", async () => {
  const requests: Array<{ body: unknown; path: string }> = []
  const gateway = new GmailGateway("token", async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    requests.push({ body: init?.body ? JSON.parse(String(init.body)) : null, path: url.pathname })
    return url.pathname.endsWith("/watch")
      ? Response.json({ expiration: "2000000000000", historyId: "100" })
      : new Response(null, { status: 204 })
  })

  assert.equal((await gateway.watch("projects/example/topics/gmail")).historyId, "100")
  await gateway.stop()
  assert.deepEqual(requests, [
    { body: { topicName: "projects/example/topics/gmail" }, path: "/gmail/v1/users/me/watch" },
    { body: {}, path: "/gmail/v1/users/me/stop" },
  ])
})

test("Gmail mutations use native modify, trash, batch, and custom-label endpoints without retries", async () => {
  const requests: Array<{ body: unknown; method: string; path: string }> = []
  const gateway = new GmailGateway("token", async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method ?? "GET",
      path: url.pathname,
    })
    if (init?.method === "DELETE") return new Response(null, { status: 204 })
    return Response.json({ id: url.pathname.includes("labels") ? "Label_1" : "message-1", name: "Projects", type: "user" })
  })

  await gateway.modifyThread("thread-1", { addLabelIds: ["STARRED"] })
  await gateway.modifyMessage("message-1", { removeLabelIds: ["UNREAD"] })
  await gateway.batchModifyMessages(["message-1"], { removeLabelIds: ["INBOX"] })
  await gateway.trashThread("thread-1")
  await gateway.untrashMessage("message-1")
  await gateway.createLabel({ name: "Projects" })
  await gateway.updateLabel("Label_1", { labelListVisibility: "labelHide" })
  await gateway.deleteLabel("Label_1")

  assert.deepEqual(requests.map(({ method, path }) => ({ method, path })), [
    { method: "POST", path: "/gmail/v1/users/me/threads/thread-1/modify" },
    { method: "POST", path: "/gmail/v1/users/me/messages/message-1/modify" },
    { method: "POST", path: "/gmail/v1/users/me/messages/batchModify" },
    { method: "POST", path: "/gmail/v1/users/me/threads/thread-1/trash" },
    { method: "POST", path: "/gmail/v1/users/me/messages/message-1/untrash" },
    { method: "POST", path: "/gmail/v1/users/me/labels" },
    { method: "PATCH", path: "/gmail/v1/users/me/labels/Label_1" },
    { method: "DELETE", path: "/gmail/v1/users/me/labels/Label_1" },
  ])
  assert.deepEqual(requests[2]?.body, { ids: ["message-1"], removeLabelIds: ["INBOX"] })
})

test("unsafe Gmail writes are never retried", async () => {
  let calls = 0
  const gateway = new GmailGateway("token", async () => {
    calls += 1
    return new Response("unavailable", { status: 503 })
  })
  await assert.rejects(gateway.modifyMessage("message-1", { addLabelIds: ["STARRED"] }), GmailApiError)
  assert.equal(calls, 1)
})

test("Gmail compose APIs use draft, send, and Sent-mail search endpoints", async () => {
  const requests: Array<{ body: unknown; method: string; path: string; query: string }> = []
  const gateway = new GmailGateway("token", async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method ?? "GET",
      path: url.pathname,
      query: url.search,
    })
    if (init?.method === "DELETE") return new Response(null, { status: 204 })
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "sent-1" }] })
    return Response.json({ id: "draft-1", message: { id: "message-1" } })
  })

  await gateway.createDraft({ message: { raw: "encoded", threadId: "thread-1" } })
  await gateway.updateDraft("draft-1", { message: { raw: "updated" } })
  await gateway.deleteDraft("draft-1")
  await gateway.sendDraft("draft-1")
  await gateway.sendMessage({ raw: "encoded" })
  await gateway.listMessages({ query: "in:sent rfc822msgid:<stable@example.com>" })

  assert.deepEqual(requests.map(({ method, path }) => ({ method, path })), [
    { method: "POST", path: "/gmail/v1/users/me/drafts" },
    { method: "PUT", path: "/gmail/v1/users/me/drafts/draft-1" },
    { method: "DELETE", path: "/gmail/v1/users/me/drafts/draft-1" },
    { method: "POST", path: "/gmail/v1/users/me/drafts/send" },
    { method: "POST", path: "/gmail/v1/users/me/messages/send" },
    { method: "GET", path: "/gmail/v1/users/me/messages" },
  ])
  assert.match(requests.at(-1)?.query ?? "", /rfc822msgid/)
})

test("attachment responses remain streaming responses and are not decoded or retained", async () => {
  const encoded = Buffer.from("attachment-bytes").toString("base64url")
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{"size":16,"data":"${encoded.slice(0, 8)}`))
      controller.enqueue(new TextEncoder().encode(`${encoded.slice(8)}"}`))
      controller.close()
    },
  })
  const gateway = new GmailGateway("token", async () => new Response(body, {
    headers: { "content-type": "application/pdf" },
  }))
  const response = await gateway.getAttachment("message-1", "attachment-1")

  assert.ok(response.body)
  assert.equal(await response.text(), "attachment-bytes")
})

test("attachment decoder rejects malformed provider envelopes", async () => {
  const response = decodeGmailAttachmentResponse(Response.json({ size: 12 }))
  await assert.rejects(response.arrayBuffer(), /invalid attachment payload/)
})
