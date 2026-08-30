import assert from "node:assert/strict"
import { test } from "vitest"

import { verifyGoogleIdToken } from "./google-id-token"

test("Google identity tokens require a valid signature, audience, issuer, and verified email", async () => {
  const pair = await crypto.subtle.generateKey(
    { hash: "SHA-256", modulusLength: 2048, name: "RSASSA-PKCS1-v1_5", publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  )
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const fetcher = async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: "key-1" }] }), {
    headers: { "cache-control": "max-age=300", "content-type": "application/json" },
  })
  const token = await signToken(pair.privateKey, {
    aud: "gmail-client",
    email: "Person@Example.com",
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 300,
    iss: "https://accounts.google.com",
    sub: "google-subject",
  })

  assert.deepEqual(await verifyGoogleIdToken(token, "gmail-client", fetcher as typeof fetch), {
    email: "person@example.com",
    subject: "google-subject",
  })
  await assert.rejects(
    verifyGoogleIdToken(token, "different-client", fetcher as typeof fetch),
    /validation failed/,
  )
})

async function signToken(key: CryptoKey, claims: Record<string, unknown>) {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "key-1", typ: "JWT" }))
  const payload = base64Url(JSON.stringify(claims))
  const data = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data),
  )
  return `${data}.${Buffer.from(signature).toString("base64url")}`
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url")
}
