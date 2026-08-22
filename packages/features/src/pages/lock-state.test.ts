import assert from "node:assert/strict"
import test from "node:test"

import { isMeetingLocked, isPageLocked } from "./item-relationships"

test("page and meeting locks use independent metadata flags", () => {
  const page = { metadata: { locked: true, meetingLocked: false } }

  assert.equal(isPageLocked(page), true)
  assert.equal(isMeetingLocked(page), false)
})

test("lock metadata only treats an explicit true value as locked", () => {
  assert.equal(isPageLocked(undefined), false)
  assert.equal(isPageLocked({ metadata: { locked: false } }), false)
  assert.equal(isMeetingLocked({ metadata: { meetingLocked: true } }), true)
})
