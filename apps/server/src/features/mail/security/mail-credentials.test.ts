import assert from "node:assert/strict"
import { test } from "vitest"

import { decryptMailSecret, encryptMailSecret } from "./mail-credentials"

const key = Buffer.alloc(32, 7).toString("base64")
const env = { GMAIL_TOKEN_ENCRYPTION_KEY: key }
const context = {
  connectionId: "connection-1",
  purpose: "refresh_token" as const,
  userId: "user-1",
}

test("mail secrets round trip with versioned authenticated encryption", async () => {
  const encrypted = await encryptMailSecret(env, "refresh-secret", context)

  assert.equal(encrypted.keyVersion, "v1")
  assert.ok(!encrypted.ciphertext.includes("refresh-secret"))
  assert.equal(await decryptMailSecret(env, encrypted, context), "refresh-secret")
})

test("mail secrets cannot be moved between users or purposes", async () => {
  const encrypted = await encryptMailSecret(env, "refresh-secret", context)

  await assert.rejects(
    decryptMailSecret(env, encrypted, { ...context, userId: "user-2" }),
    /could not be decrypted/,
  )
  await assert.rejects(
    decryptMailSecret(env, encrypted, {
      ...context,
      purpose: "oauth_verifier",
    }),
    /could not be decrypted/,
  )
})

test("mail credential keys must decode to exactly 32 bytes", async () => {
  await assert.rejects(
    encryptMailSecret(
      { GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") },
      "secret",
      context,
    ),
    /32-byte key/,
  )
})
