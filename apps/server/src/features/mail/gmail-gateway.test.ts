import assert from "node:assert/strict"
import { test } from "vitest"

import {
  accessTokenFromRefresh,
  clearGmailAccessTokenCache,
  decodeGmailAttachmentResponse,
  getCachedGmailAccessToken,
  GmailApiError,
  GmailGateway,
} from "./gmail-gateway"

test("safe Gmail reads retry transient failures and preserve pagination parameters", async () => {
  const requests: URL[] = []
  const gateway = new GmailGateway("access-token", async (input) => {
    assert.equal(typeof input, "string")
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

test("Gmail fetch stays bound to the Worker global receiver", async () => {
  const receiverSensitiveFetch = function (this: unknown) {
    assert.equal(this, globalThis)
    return Promise.resolve(Response.json({ labels: [] }))
  } as typeof fetch
  const gateway = new GmailGateway("access-token", receiverSensitiveFetch)

  await gateway.listLabels()
})

test("Gmail transport failures are not mislabeled as timeouts", async () => {
  const unavailable = new GmailGateway("token", async () => {
    throw new TypeError("provider transport details")
  })
  await assert.rejects(
    unavailable.listLabels(),
    (error: unknown) => error instanceof GmailApiError &&
      error.status === 502 &&
      error.message === "Gmail could not be reached." &&
      !error.message.includes("provider transport details"),
  )

  const timedOut = new GmailGateway("token", async () => {
    throw new DOMException("The operation timed out", "TimeoutError")
  })
  await assert.rejects(
    timedOut.listLabels(),
    (error: unknown) => error instanceof GmailApiError &&
      error.status === 504 &&
      error.message === "Gmail did not respond in time.",
  )
})

test("thread metadata uses one Gmail batch request with Worker-compatible inputs", async () => {
  const requests: Array<{ body: string; input: RequestInfo | URL }> = []
  const responseBoundary = "batch_response"
  const gateway = new GmailGateway("token", async (input, init) => {
    requests.push({ body: String(init?.body ?? ""), input })
    const parts = ["thread-1", "thread-2"].map((id, index) => [
      `--${responseBoundary}`,
      "Content-Type: application/http",
      `Content-ID: <response-thread-${index}>`,
      "",
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      JSON.stringify({ id, messages: [] }),
    ].join("\r\n")).join("\r\n")
    return new Response(`${parts}\r\n--${responseBoundary}--\r\n`, {
      headers: { "content-type": `multipart/mixed; boundary=${responseBoundary}` },
    })
  })

  const threads = await gateway.getThreads(["thread-1", "thread-2"], "metadata")

  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.input, "https://gmail.googleapis.com/batch/gmail/v1")
  assert.match(requests[0]?.body ?? "", /GET \/gmail\/v1\/users\/me\/threads\/thread-1\?format=metadata/)
  assert.match(requests[0]?.body ?? "", /metadataHeaders=Subject/)
  assert.deepEqual(threads.map((thread) => thread.id), ["thread-1", "thread-2"])
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

test("Gmail access tokens are reused, coalesced, expired, and credential-bound", async () => {
  clearGmailAccessTokenCache()
  let refreshes = 0
  const refresh = async () => {
    refreshes += 1
    await Promise.resolve()
    return { accessToken: `access-${refreshes}`, expiresInSeconds: 3_600 }
  }
  const identity = { connectionId: "connection-1", credentialVersion: "credential-1" }

  const [first, coalesced] = await Promise.all([
    getCachedGmailAccessToken(identity, refresh, 1_000),
    getCachedGmailAccessToken(identity, refresh, 1_000),
  ])
  assert.equal(first, "access-1")
  assert.equal(coalesced, "access-1")
  assert.equal(await getCachedGmailAccessToken(identity, refresh, 2_000), "access-1")
  assert.equal(refreshes, 1)

  assert.equal(
    await getCachedGmailAccessToken({ ...identity, credentialVersion: "credential-2" }, refresh, 2_000),
    "access-2",
  )
  assert.equal(await getCachedGmailAccessToken(identity, refresh, 3_302_000), "access-3")
  assert.equal(refreshes, 3)

  let finishRefresh!: (value: { accessToken: string; expiresInSeconds: number }) => void
  const invalidated = getCachedGmailAccessToken(
    { connectionId: "connection-2", credentialVersion: "credential-1" },
    () => new Promise((resolve) => { finishRefresh = resolve }),
    4_000,
  )
  clearGmailAccessTokenCache("connection-2")
  finishRefresh({ accessToken: "invalidated-access", expiresInSeconds: 3_600 })
  await invalidated
  let replacementRefreshes = 0
  assert.equal(await getCachedGmailAccessToken(
    { connectionId: "connection-2", credentialVersion: "credential-1" },
    async () => {
      replacementRefreshes += 1
      return { accessToken: "replacement-access", expiresInSeconds: 3_600 }
    },
    5_000,
  ), "replacement-access")
  assert.equal(replacementRefreshes, 1)
  clearGmailAccessTokenCache()
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

test("attachment decoder stops oversized streams without retaining their bytes", async () => {
  const response = decodeGmailAttachmentResponse(
    Response.json({ data: Buffer.from("too-large").toString("base64url") }),
    4,
  )
  await assert.rejects(response.arrayBuffer(), /too large/)
})
