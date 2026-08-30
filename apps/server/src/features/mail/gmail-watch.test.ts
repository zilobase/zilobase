import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import { gmailPubsubTopic } from "./gmail-watch"

test("Gmail watch topics require canonical Pub/Sub resource names", () => {
  assert.equal(
    gmailPubsubTopic({ GMAIL_PUBSUB_TOPIC: "projects/example-project/topics/zilobase-gmail" }),
    "projects/example-project/topics/zilobase-gmail",
  )
  assert.throws(() => gmailPubsubTopic({ GMAIL_PUBSUB_TOPIC: "https://evil.example/topic" }), /invalid/)
})

test("watch renewal uses a database claim lock and both maintenance runtimes", async () => {
  const [watch, nodeRuntime, cloudRuntime] = await Promise.all([
    readFile(new URL("./gmail-watch.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/node/node-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../../../../zilobase-cloud-adapter/src/worker.ts", import.meta.url), "utf8"),
  ])
  assert.match(watch, /\.returning\(\{ id: gmailConnection\.id \}\)/)
  assert.match(watch, /RENEW_LOCK_MS/)
  assert.match(nodeRuntime, /renewGmailWatches\(env\)/)
  assert.match(cloudRuntime, /renewGmailWatches\(env\)/)
})
