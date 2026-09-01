import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import { seededMailViewId } from "./mail-views"

test("seed view IDs are deterministic per binding", () => {
  assert.equal(
    seededMailViewId("binding-1", "inbox"),
    seededMailViewId("binding-1", "inbox"),
  )
  assert.notEqual(
    seededMailViewId("binding-1", "inbox"),
    seededMailViewId("binding-2", "inbox"),
  )
})

test("mail view service seeds protected Inbox plus Unread and Starred", async () => {
  const source = await readFile(new URL("./mail-views.ts", import.meta.url), "utf8")

  assert.match(source, /\["inbox", "unread", "starred"\] as const/)
  assert.match(source, /protected: template\.protected/)
  assert.match(source, /if \(existing\.protected\)/)
  assert.match(source, /Inbox cannot be deleted/)
  assert.match(source, /eq\(mailView\.bindingId, input\.bindingId\)/)
})

test("workspace routes expose view bootstrap and mutation operations", async () => {
  const source = await readFile(new URL("./routes.ts", import.meta.url), "utf8")

  for (const route of [
    'get("/views"',
    'post("/views"',
    'put("/views/reorder"',
    'post("/views/:viewId/duplicate"',
    'patch("/views/:viewId"',
    'delete("/views/:viewId"',
  ]) {
    assert.ok(source.includes(route), `missing route ${route}`)
  }
  assert.match(source, /systemFolders: mailSystemFolderIds/)
  assert.match(source, /requireWorkspaceMailBinding/)
})
