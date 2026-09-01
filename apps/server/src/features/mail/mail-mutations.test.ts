import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import {
  parseMailActionRequest,
  parseMailBatchModifyRequest,
  parseMailLabelWriteRequest,
  parseMailModifyRequest,
} from "./routes"

test("mail label deltas reject overlaps, duplicates, malformed IDs, and empty mutations", () => {
  assert.deepEqual(parseMailModifyRequest({
    addLabelIds: ["STARRED", "Label_1"],
    removeLabelIds: ["UNREAD"],
  }), {
    addLabelIds: ["STARRED", "Label_1"],
    removeLabelIds: ["UNREAD"],
  })
  assert.equal(parseMailModifyRequest({}), null)
  assert.equal(parseMailModifyRequest({ addLabelIds: ["STARRED", "STARRED"] }), null)
  assert.equal(parseMailModifyRequest({ addLabelIds: ["STARRED"], removeLabelIds: ["STARRED"] }), null)
  assert.equal(parseMailModifyRequest({ addLabelIds: ["not valid"] }), null)
})

test("mail batches enforce provider-safe limits and unique owned target IDs", () => {
  assert.deepEqual(parseMailBatchModifyRequest({
    addLabelIds: ["STARRED"],
    ids: ["thread-1", "thread-2"],
  }, 50)?.ids, ["thread-1", "thread-2"])
  assert.equal(parseMailBatchModifyRequest({ addLabelIds: ["STARRED"], ids: [] }, 50), null)
  assert.equal(parseMailBatchModifyRequest({ addLabelIds: ["STARRED"], ids: ["same", "same"] }, 50), null)
  assert.equal(parseMailBatchModifyRequest({ addLabelIds: ["STARRED"], ids: Array.from({ length: 51 }, (_, index) => `id-${index}`) }, 50), null)
})

test("mail system actions expose trash and restore but not permanent deletion", () => {
  assert.deepEqual(parseMailActionRequest({ action: "trash" }), { action: "trash" })
  assert.deepEqual(parseMailActionRequest({ action: "restore" }), { action: "restore" })
  assert.equal(parseMailActionRequest({ action: "delete" }), null)
})

test("custom label writes validate names, visibility, and sanitized Gmail colors", () => {
  assert.deepEqual(parseMailLabelWriteRequest({
    color: { backgroundColor: "#16a766", ignored: "value", textColor: "#ffffff" },
    labelListVisibility: "labelShow",
    messageListVisibility: "show",
    name: " Projects ",
  }, true), {
    color: { backgroundColor: "#16a766", textColor: "#ffffff" },
    labelListVisibility: "labelShow",
    messageListVisibility: "show",
    name: "Projects",
  })
  assert.equal(parseMailLabelWriteRequest({ name: "bad\nlabel" }, true), null)
  assert.equal(parseMailLabelWriteRequest({ labelListVisibility: "always" }, false), null)
  assert.equal(parseMailLabelWriteRequest({ color: { backgroundColor: "#123456", textColor: "#ffffff" } }, false), null)
})

test("mail mutation routes always resolve the authenticated workspace binding", async () => {
  const source = await readFile(new URL("./routes.ts", import.meta.url), "utf8")
  for (const route of ["batch-modify", "/modify", "/action", "patch(\"/labels", "delete(\"/labels"]) {
    assert.ok(source.includes(route))
  }
  assert.match(source, /eq\(gmailWorkspaceConnection\.workspaceId, workspaceId\)/)
  assert.match(source, /eq\(gmailWorkspaceConnection\.userId, user\.id\)/)
  assert.match(source, /eq\(gmailAccount\.userId, user\.id\)/)
  assert.doesNotMatch(source, /messages\/:messageId[^\n]*delete/i)
  assert.doesNotMatch(source, /threads\/:threadId[^\n]*delete/i)
})
