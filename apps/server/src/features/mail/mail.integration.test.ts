import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, test, vi } from "vitest"
import { generateKeyPair, exportJWK, SignJWT } from "jose"
import * as schema from "../../infrastructure/database/schema"
import { runWithDb } from "../../infrastructure/database"
import type { AppBindings } from "../../shared/types"
import { GmailGateway, type GmailDraft, type GmailMessage } from "./provider/gmail-gateway"
import { mailRoutes } from "./routes"
import { sendGmailComposition } from "./compose/mail-compose"
import { beginGmailOauth, completeGmailOauth } from "./provider/google-oauth"
import { decryptMailSecret } from "./provider/security/mail-credentials"

const provider = vi.hoisted(() => ({ gateway: null as unknown }))
vi.mock("./provider/gmail-gateway", async (original) => ({
  ...(await original<typeof import("./provider/gmail-gateway")>()),
  createGmailGateway: async () => provider.gateway,
}))
const enabled = Boolean(process.env.MAIL_TEST_DATABASE_URL)
const pool = enabled ? new Pool({ connectionString: process.env.MAIL_TEST_DATABASE_URL }) : null
const database = pool ? drizzle(pool, { schema }) : null
const userId = randomUUID(), workspaceId = randomUUID(), otherWorkspaceId = randomUUID(), accountId = randomUUID()
const env = { DATABASE_URL: process.env.MAIL_TEST_DATABASE_URL, BETTER_AUTH_URL: "http://localhost:3000", CLIENT_URL: "http://localhost:1420", GMAIL_GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", GMAIL_GOOGLE_CLIENT_SECRET: "fixture", GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64") }
let user: typeof schema.user.$inferSelect
let account: typeof schema.gmailAccount.$inferSelect
beforeAll(async () => {
  if (!database) return
  ;[user] = await database.insert(schema.user).values({ id: userId, name: "Mail fixture", email: `${userId}@example.test`, emailVerified: true }).returning()
  await database.insert(schema.workspace).values([{ id: workspaceId, name: "Mail A", slug: workspaceId }, { id: otherWorkspaceId, name: "Mail B", slug: otherWorkspaceId }])
  await database.insert(schema.member).values({ id: randomUUID(), organizationId: workspaceId, userId, role: "owner" })
  ;[account] = await database.insert(schema.gmailAccount).values({ id: accountId, userId, googleSubject: "fixture", email: "sender@example.test", refreshTokenCiphertext: "fixture", refreshTokenIv: "fixture", refreshTokenKeyVersion: "1" }).returning()
  await database.insert(schema.gmailWorkspaceConnection).values({ id: randomUUID(), userId, workspaceId, gmailAccountId: accountId })
})
afterAll(async () => { await pool?.end() })
const app = new Hono<AppBindings>().use("*", async (c, next) => {
  c.set("user", user)
  await runWithDb(database!, next)
}).route("/workspaces/:workspaceId/mail", mailRoutes)
function request(path: string, method = "GET", body?: unknown, workspace = workspaceId) {
  return app.request(`/workspaces/${workspace}/mail${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) }, env)
}
const composition = () => ({ clientOperationId: randomUUID(), to: [{ address: "recipient@example.test", name: null }], cc: [], bcc: [], subject: "Fixture", bodyText: "Hello", attachments: [] })
const message = (id: string): GmailMessage => ({ id, threadId: "thread", labelIds: ["SENT"], payload: { mimeType: "text/plain", body: { data: Buffer.from("Hello").toString("base64url") }, headers: [{ name: "Subject", value: "Fixture" }] } })

test.skipIf(!enabled)("actual mail routes round-trip a draft and recover send after its provider deletion", async () => {
  const drafts = new Map<string, GmailDraft>()
  let deliveries = 0
  provider.gateway = new GmailGateway("fixture", async (input, options) => {
    const url = new URL(String(input))
    const path = url.pathname
    const method = options?.method ?? "GET"
    if (path === "/batch/gmail/v1") return new Response([
      "--fixture", "Content-Type: application/http", "Content-ID: <response-thread-0>", "", "HTTP/1.1 200 OK", "Content-Type: application/json", "",
      JSON.stringify({ id: "thread", messages: [message("sent")] }), "--fixture--", "",
    ].join("\r\n"), { headers: { "content-type": "multipart/mixed; boundary=fixture" } })
    if (path.endsWith("/drafts") && method === "POST") { const draft = { id: "draft", message: message("draft-message") }; drafts.set("draft", draft); return Response.json(draft) }
    if (path.endsWith("/drafts") && method === "GET") return Response.json({ drafts: [...drafts.values()] })
    if (path.endsWith("/drafts/draft")) {
      const draft = drafts.get("draft")
      return draft ? Response.json(draft) : Response.json({ error: { message: "deleted" } }, { status: 404 })
    }
    if (path.endsWith("/drafts/send")) { assert.ok(drafts.delete("draft")); deliveries++; return Response.json(message("sent")) }
    if (path.endsWith("/messages")) return Response.json({ messages: [] })
    if (path.endsWith("/messages/sent")) return Response.json(message("sent"))
    if (path.endsWith("/threads/thread/modify")) return Response.json({})
    if (path.endsWith("/threads/thread")) return Response.json({ id: "thread", messages: [message("sent")] })
    if (path.endsWith("/threads")) return Response.json({ threads: [{ id: "thread" }] })
    if (path.endsWith("/labels")) return Response.json({ labels: [] })
    if (path.endsWith("/profile")) return Response.json({ historyId: "20" })
    if (path.endsWith("/attachments/file")) return Response.json({ data: Buffer.from("fixture bytes").toString("base64url"), size: 13 })
    throw new Error(`Unexpected fixture route ${method} ${path}`)
  })
  const compose = composition()
  assert.equal((await request("/drafts", "POST", compose)).status, 201)
  assert.equal((await (await request("/drafts")).json()).drafts.length, 1)
  assert.equal((await (await request("/drafts/draft")).json()).draftId, "draft")
  assert.equal((await request("/drafts/draft", "PUT", compose)).status, 200)
  const first = await request("/drafts/draft/send", "POST", compose)
  assert.equal(first.status, 200)
  assert.equal((await first.json()).messageId, "sent")
  const retry = await request("/drafts/draft/send", "POST", compose)
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).reused, true)
  assert.equal(deliveries, 1)
  const sync = await request("/sync", "POST", { connectionId: accountId, view: "sent" })
  assert.equal(sync.status, 200)
  assert.equal((await sync.json()).threads[0].id, "thread")
  const thread = await request("/threads/thread")
  assert.equal((await thread.json()).messages[0].bodyText, "Hello")
  assert.equal((await request("/threads/thread/modify", "POST", { addLabelIds: ["STARRED"] })).status, 200)
  assert.equal(await (await request("/messages/sent/attachments/file")).text(), "fixture bytes")
  assert.equal((await request("/drafts/draft/send", "POST", { ...compose, bodyText: "different" })).status, 409)
  assert.equal((await request("/drafts", "GET", undefined, otherWorkspaceId)).status, 403)
})

test.skipIf(!enabled)("PostgreSQL receipt contention permits one provider delivery", async () => {
  let deliveries = 0
  const gateway = new GmailGateway("fixture", async (input, options) => {
    if (options?.method === "POST") { deliveries++; await new Promise(resolve => setTimeout(resolve, 50)); return Response.json(message("concurrent")) }
    return Response.json(String(input).includes("/messages/concurrent") ? message("concurrent") : { messages: [] })
  })
  const compose = composition()
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => runWithDb(database!, () => sendGmailComposition({ compose, connection: account, gateway, userId }))))
  assert.equal(deliveries, 1)
  assert.ok(results.some(result => result.status === "fulfilled"))
  assert.equal((await database!.select().from(schema.gmailSendOperation).where(eq(schema.gmailSendOperation.id, compose.clientOperationId)))[0].status, "sent")
})

test.skipIf(!enabled)("concurrent OAuth callbacks atomically bind decryptable account credentials and reject replay", async () => {
  const keys = await generateKeyPair("RS256")
  const jwk = { ...await exportJWK(keys.publicKey), kid: "mail-integration" }
  const token = await new SignJWT({ email: "oauth@example.test", email_verified: true }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).setIssuer("https://accounts.google.com").setAudience(env.GMAIL_GOOGLE_CLIENT_ID).setSubject("oauth-subject").setExpirationTime("5m").sign(keys.privateKey)
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes("/certs")) return Response.json({ keys: [jwk] })
    if (url.includes("/token")) return Response.json({ access_token: "access", refresh_token: "refresh-fixture", id_token: token, scope: "openid email https://www.googleapis.com/auth/gmail.modify" })
    if (url.includes("/profile")) return Response.json({ emailAddress: "oauth@example.test" })
    throw new Error("Unexpected OAuth fixture URL")
  }
  const starts = await runWithDb(database!, () => Promise.all([0, 1].map(() => beginGmailOauth(env, { clientKind: "web", userId, workspaceId }))))
  const states = starts.map(url => new URL(url).searchParams.get("state")!)
  const completed = await Promise.all(states.map(state => completeGmailOauth(env, { code: "fixture", state }, fetcher)))
  assert.equal(completed[0].connectionId, completed[1].connectionId)
  const [saved] = await database!.select().from(schema.gmailAccount).where(eq(schema.gmailAccount.id, completed[0].connectionId))
  assert.equal(await decryptMailSecret(env, { ciphertext: saved.refreshTokenCiphertext, iv: saved.refreshTokenIv, keyVersion: saved.refreshTokenKeyVersion }, { connectionId: saved.id, purpose: "refresh_token", userId }), "refresh-fixture")
  await assert.rejects(completeGmailOauth(env, { code: "fixture", state: states[0] }, fetcher), /expired|already used/)
  await database!.update(schema.gmailAccount).set({ mailboxRevision: 42 }).where(eq(schema.gmailAccount.id, saved.id))
  const reconnect = await runWithDb(database!, () => beginGmailOauth(env, { clientKind: "web", userId, workspaceId }))
  await completeGmailOauth(env, { code: "fixture", state: new URL(reconnect).searchParams.get("state")! }, fetcher)
  const [reconnected] = await database!.select().from(schema.gmailAccount).where(eq(schema.gmailAccount.id, saved.id))
  assert.equal(reconnected.mailboxRevision, 42)
}, 30_000)
