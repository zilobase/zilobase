import assert from "node:assert/strict"
import { test } from "node:test"

import { validateGmailDeploymentConfig } from "./gmail-deployment-config.mjs"

const complete = {
  BETTER_AUTH_URL: "https://notes.example.com",
  GMAIL_GOOGLE_CLIENT_ID: "123-example.apps.googleusercontent.com",
  GMAIL_GOOGLE_CLIENT_SECRET: "client-secret",
  GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  GMAIL_PUBSUB_TOPIC: "projects/example-project/topics/zilobase-gmail",
  GMAIL_PUBSUB_PUSH_AUDIENCE: "https://notes.example.com/mail/google/pubsub",
  GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL: "zilobase-gmail-push@example-project.iam.gserviceaccount.com",
  GMAIL_PUBSUB_SUBSCRIPTION: "projects/example-project/subscriptions/zilobase-gmail-push",
}

test("permits a deployment with Gmail disabled", () => {
  assert.deepEqual(validateGmailDeploymentConfig({}), { enabled: false })
})

test("accepts complete production Gmail configuration", () => {
  assert.deepEqual(validateGmailDeploymentConfig(complete), {
    callbackUrl: "https://notes.example.com/mail/oauth/google/callback",
    enabled: true,
    pushEnabled: true,
    webhookUrl: "https://notes.example.com/mail/google/pubsub",
  })
})

test("accepts OAuth-only loopback development", () => {
  const local = Object.fromEntries(Object.entries(complete).filter(([name]) => !name.startsWith("GMAIL_PUBSUB_")))
  assert.equal(validateGmailDeploymentConfig({ ...local, BETTER_AUTH_URL: "http://127.0.0.1:3000" }).pushEnabled, false)
})

test("rejects partial production and invalid security configuration", () => {
  assert.throws(
    () => validateGmailDeploymentConfig({ BETTER_AUTH_URL: complete.BETTER_AUTH_URL, GMAIL_GOOGLE_CLIENT_ID: complete.GMAIL_GOOGLE_CLIENT_ID }),
    /incomplete/,
  )
  assert.throws(
    () => validateGmailDeploymentConfig({ ...complete, GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }),
    /32-byte/,
  )
  assert.throws(
    () => validateGmailDeploymentConfig({ ...complete, GMAIL_PUBSUB_PUSH_AUDIENCE: "https://notes.example.com/wrong" }),
    /exactly equal/,
  )
  const oauthOnly = Object.fromEntries(Object.entries(complete).filter(([name]) => !name.startsWith("GMAIL_PUBSUB_")))
  assert.throws(() => validateGmailDeploymentConfig(oauthOnly), /requires the complete Pub\/Sub/)
})
