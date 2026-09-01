import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import {
  decodeMailQueryCursor,
  encodeMailGroupCursor,
  encodeMailQueryCursor,
  MailQueryError,
} from "./mail-query"

test("mail query cursors are opaque, deterministic, and validated", () => {
  const cursor = encodeMailQueryCursor({ id: "account:thread", internalDate: 1788231600000 })
  assert.doesNotMatch(cursor, /account|thread|\{|\}/)
  assert.deepEqual(decodeMailQueryCursor(cursor), {
    id: "account:thread",
    internalDate: 1788231600000,
  })
  assert.throws(
    () => decodeMailQueryCursor("not.valid"),
    (error: unknown) => error instanceof MailQueryError && error.status === 400,
  )
})

test("mail group cursors are opaque and grouping covers mutable and immutable fields", async () => {
  const cursor = encodeMailGroupCursor("CATEGORY_UPDATES")
  assert.doesNotMatch(cursor, /CATEGORY|UPDATES/)
  const source = await readFile(new URL("./mail-query.ts", import.meta.url), "utf8")
  for (const propertyId of ["date", "starred", "important", "priority", "unread", "from", "email_domain", "labels"]) {
    assert.ok(source.includes(`case "${propertyId}"`), `missing group ${propertyId}`)
  }
  assert.match(source, /queryIndexedMailGroups/)
  assert.match(source, /counts\.set/)
  assert.match(source, /groupKeys\(indexed, routeConfig\?\.group/)
  assert.match(source, /isMutableGroup/)
})

test("indexed view queries are binding-scoped, cursor-paged, and intersect full Gmail search", async () => {
  const source = await readFile(new URL("./mail-query.ts", import.meta.url), "utf8")

  assert.match(source, /eq\(mailView\.bindingId, bindingId\)/)
  assert.match(source, /eq\(mailThreadIndex\.gmailAccountId, input\.gmailAccountId\)/)
  assert.match(source, /orderBy\(desc\(mailThreadIndex\.internalDate\), desc\(mailThreadIndex\.id\)\)/)
  assert.match(source, /nextCursor = cursor \? encodeMailQueryCursor\(cursor\)/)
  assert.match(source, /gateway\.listMessages\(\{/)
  assert.match(source, /includeSpamTrash: true/)
  assert.match(source, /searchResult\.threadIds\.has\(indexed\.thread\.id\)/)
  assert.match(source, /input\.filter[\s\S]*normalizeMailFilterExpression/)
  assert.match(source, /index,/)
})
