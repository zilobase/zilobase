import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const readMailRouteSources = async () => (await Promise.all([
  "connection-routes.ts", "route-support.ts",
].map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n")

import {
  buildGmailAuthorizationUrl,
  gmailOauthCallbackUrl,
  hasRequiredGmailScopes,
} from "./google-oauth"
import { buildDesktopMailReturnUrl, mailRoutes } from "./routes"

const env = {
  BETTER_AUTH_URL: "https://api.zilobase.example",
  CLIENT_URL: "https://zilobase.example",
  GMAIL_GOOGLE_CLIENT_ID: "gmail-client",
  GMAIL_GOOGLE_CLIENT_SECRET: "gmail-secret",
  GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
}

test("mail HTTP routes are unavailable when the feature is disabled", async () => {
  const response = await mailRoutes.request("/connection", undefined, {})

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { message: "Not found." })
})

test("Gmail OAuth requests exact callback, offline access, PKCE, and only required scopes", () => {
  const url = buildGmailAuthorizationUrl(env, {
    challenge: "pkce-challenge",
    state: "opaque-state",
  })

  assert.equal(url.origin, "https://accounts.google.com")
  assert.equal(url.pathname, "/o/oauth2/v2/auth")
  assert.equal(url.searchParams.get("client_id"), "gmail-client")
  assert.equal(url.searchParams.get("redirect_uri"), gmailOauthCallbackUrl(env))
  assert.equal(url.searchParams.get("access_type"), "offline")
  assert.equal(url.searchParams.get("code_challenge_method"), "S256")
  assert.equal(url.searchParams.get("code_challenge"), "pkce-challenge")
  assert.equal(url.searchParams.get("prompt"), "consent")
  assert.deepEqual(
    new Set(url.searchParams.get("scope")?.split(" ")),
    new Set(["openid", "email", "https://www.googleapis.com/auth/gmail.modify"]),
  )
})

test("desktop Gmail completion contains routing metadata but no OAuth credentials", () => {
  const url = buildDesktopMailReturnUrl({
    apiOrigin: "https://api.zilobase.example",
    instanceId: "instance-1",
  })

  assert.equal(url.protocol, "zilobase:")
  assert.equal(url.hostname, "open")
  assert.equal(url.searchParams.get("path"), "/mail?connection=success")
  assert.equal(url.searchParams.get("server"), "https://api.zilobase.example")
  assert.equal(url.searchParams.get("instance"), "instance-1")
  assert.equal(url.searchParams.has("code"), false)
  assert.equal(url.searchParams.has("state"), false)
  assert.equal(url.searchParams.has("token"), false)
})

test("public Gmail OAuth completion establishes its own database context", async () => {
  const source = await readFile(new URL("./google-oauth.ts", import.meta.url), "utf8")
  assert.match(source, /return runWithDbEnv\(env, \(\) => completeGmailOauthWithDatabase\(env, input, fetcher\)\)/)
})

test("successful public Gmail callbacks keep watch setup in database context", async () => {
  const source = await readMailRouteSources()
  const callback = source.slice(source.indexOf('mailProviderCallbackRoutes.get("/oauth/google/callback"'), source.indexOf('mailConnectionRoutes.delete("/connection"'))

  assert.match(callback, /runWithDbEnv\(c\.env, async \(\) =>/)
  assert.match(callback, /completeGmailOauth[\s\S]*db[\s\S]*initializeGmailWatch/)
})

test("Gmail OAuth accepts Google's canonical email scope alias", () => {
  assert.equal(hasRequiredGmailScopes(new Set([
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.modify",
  ])), true)
  assert.equal(hasRequiredGmailScopes(new Set([
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.modify",
  ])), true)
})

test("Gmail OAuth still requires identity and mailbox modification access", () => {
  assert.equal(hasRequiredGmailScopes(new Set([
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
  ])), false)
  assert.equal(hasRequiredGmailScopes(new Set([
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.modify",
  ])), false)
})
