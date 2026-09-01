import assert from "node:assert/strict"
import { test } from "vitest"

import type { GmailThread } from "./gmail-gateway"
import { assertPublicUrl, inspectOrExecuteUnsubscribe, MailUnsubscribeError, parseUnsubscribeCandidates } from "./safe-unsubscribe"

function thread(headers: Array<{ name: string; value: string }>): GmailThread {
  return { id: "thread", messages: [{ id: "message", internalDate: "10", payload: { headers }, threadId: "thread" }] }
}

function publicDnsOr(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input, init) => {
    const url = String(input)
    if (url.startsWith("https://cloudflare-dns.com/")) return Response.json({ Answer: [{ data: "93.184.216.34" }] })
    return handler(url, init)
  }) as typeof fetch
}

test("RFC 8058 one-click unsubscribe posts the required body after DNS validation", async () => {
  const requests: Array<{ body: unknown; method: string | undefined; url: string }> = []
  const result = await inspectOrExecuteUnsubscribe(thread([
    { name: "List-Unsubscribe", value: "<https://example.com/unsubscribe>" },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ]), publicDnsOr((url, init) => {
    requests.push({ body: init?.body, method: init?.method, url })
    return new Response(null, { status: 204 })
  }))
  assert.deepEqual(result, { executed: true, fallback: null })
  assert.deepEqual(requests, [{ body: "List-Unsubscribe=One-Click", method: "POST", url: "https://example.com/unsubscribe" }])
})

test("unsubscribe rejects private literals and private redirect targets", async () => {
  await assert.rejects(() => assertPublicUrl(new URL("http://127.0.0.1/unsubscribe"), fetch), (error: unknown) => error instanceof MailUnsubscribeError && error.status === 400)
  await assert.rejects(() => inspectOrExecuteUnsubscribe(thread([
    { name: "List-Unsubscribe", value: "<https://example.com/unsubscribe>" },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ]), publicDnsOr(() => new Response(null, { headers: { location: "http://10.0.0.1/private" }, status: 302 }))), /Private unsubscribe destinations/)
})

test("normal HTTPS and mailto unsubscribe candidates are returned for confirmation", async () => {
  const mailto = await inspectOrExecuteUnsubscribe(thread([{ name: "List-Unsubscribe", value: "<mailto:leave@example.com>" }]))
  assert.deepEqual(mailto, { executed: false, fallback: { kind: "mailto", url: "mailto:leave@example.com" } })
  assert.deepEqual(parseUnsubscribeCandidates("<javascript:alert(1)>, <https://example.com/u>").map(String), ["https://example.com/u"])
})
