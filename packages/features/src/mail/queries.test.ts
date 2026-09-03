import assert from "node:assert/strict"
import test from "node:test"

import {
  invalidateMailListQueries,
  mailApiBasePath,
  mailKeys,
} from "./queries"

const scope = {
  bindingId: "binding-1",
  workspaceId: "workspace-1",
}

test("mail query keys share stable feature-owned prefixes", () => {
  assert.deepEqual(mailKeys.connection("workspace-1"), [
    "mail",
    "connection",
    "workspace-1",
  ])
  assert.deepEqual(mailKeys.views(scope), [
    "mail",
    "views",
    "workspace-1",
    "binding-1",
  ])
  assert.deepEqual(
    mailKeys.threadProperties(scope, "thread-1"),
    ["mail", "thread-properties", "workspace-1", "binding-1", "thread-1"],
  )
  assert.equal(
    mailApiBasePath("workspace/a"),
    "/workspaces/workspace%2Fa/mail",
  )
})

test("mail mutations invalidate indexed results and group summaries", async () => {
  const invalidated: unknown[] = []
  await invalidateMailListQueries({
    invalidateQueries: (filters) => {
      invalidated.push(filters.queryKey)
      return Promise.resolve()
    },
  }, scope)

  assert.deepEqual(invalidated, [
    ["mail", "indexed-query", "workspace-1", "binding-1"],
    ["mail", "groups", "workspace-1", "binding-1"],
  ])
})
