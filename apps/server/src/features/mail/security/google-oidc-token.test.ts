import assert from "node:assert/strict"
import { test } from "vitest"

import { verifyGoogleOidcToken } from "./google-oidc-token"

test("Google push OIDC validation binds issuer, audience, and service-account email", async () => {
  const pair = await crypto.subtle.generateKey(
    { hash: "SHA-256", modulusLength: 2048, name: "RSASSA-PKCS1-v1_5", publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  )
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const fetcher = async () => Response.json({ keys: [{ ...jwk, kid: "push-key" }] }, {
    headers: { "cache-control": "max-age=300" },
  })
  const claims = {
    aud: "https://api.example.com/mail/google/pubsub",
    email: "gmail-push@example.iam.gserviceaccount.com",
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 300,
    iss: "https://accounts.google.com",
    sub: "service-account-subject",
  }
  const token = await sign(pair.privateKey, claims)
  const input = { audience: claims.aud, email: claims.email }

  assert.equal((await verifyGoogleOidcToken(token, input, fetcher as typeof fetch)).subject, "service-account-subject")
  await assert.rejects(verifyGoogleOidcToken(token, { ...input, audience: "wrong" }, fetcher as typeof fetch), /failed/)
  await assert.rejects(verifyGoogleOidcToken(token, { ...input, email: "wrong@example.com" }, fetcher as typeof fetch), /failed/)
  await assert.rejects(
    verifyGoogleOidcToken(await sign(pair.privateKey, { ...claims, iss: "https://evil.example" }), input, fetcher as typeof fetch),
    /failed/,
  )
})

async function sign(key: CryptoKey, claims: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "push-key" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const data = `${header}.${payload}`
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data))
  return `${data}.${Buffer.from(signature).toString("base64url")}`
}
