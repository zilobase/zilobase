import assert from "node:assert/strict"
import { test } from "vitest"

import { buildGmailAuthorizationUrl, gmailOauthCallbackUrl } from "./google-oauth"
import { buildDesktopMailReturnUrl } from "./routes"

const env = {
  BETTER_AUTH_URL: "https://api.zilobase.example",
  CLIENT_URL: "https://zilobase.example",
  GMAIL_GOOGLE_CLIENT_ID: "gmail-client",
  GMAIL_GOOGLE_CLIENT_SECRET: "gmail-secret",
  GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
}

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
