import assert from "node:assert/strict"
import test from "node:test"

import { isDatabaseLocked } from "./queries"

test("database lock is read from database config", () => {
  assert.equal(isDatabaseLocked({ config: { locked: true } }), true)
  assert.equal(isDatabaseLocked({ config: { locked: false } }), false)
})

test("database lock defaults safely for missing or malformed config", () => {
  assert.equal(isDatabaseLocked(undefined), false)
  assert.equal(isDatabaseLocked({ config: null }), false)
  assert.equal(isDatabaseLocked({ config: [] }), false)
})
