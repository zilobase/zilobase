import assert from "node:assert/strict"
import test from "node:test"

import {
  databaseOrderKeyAtPosition,
  databaseOrderKeyBetween,
  formatDatabaseOrderKey,
  parseDatabaseOrderKey,
} from "./order-key"

test("database order keys round-trip canonical scaled decimals", () => {
  for (const value of ["0", "1024", "1536.25", "-1024.0000000001"]) {
    assert.equal(formatDatabaseOrderKey(parseDatabaseOrderKey(value)), value)
  }
  assert.throws(() => parseDatabaseOrderKey("01.0"), /Invalid database order key/)
  assert.throws(() => parseDatabaseOrderKey("-0"), /Invalid database order key/)
  assert.throws(() => parseDatabaseOrderKey("1.00000000001"), /Invalid database order key/)
})

test("database order keys are spaced and find deterministic midpoints", () => {
  assert.equal(databaseOrderKeyAtPosition(0), "1024")
  assert.equal(databaseOrderKeyAtPosition(2), "3072")
  assert.equal(databaseOrderKeyBetween(null, null), "1024")
  assert.equal(databaseOrderKeyBetween(null, "2048"), "1024")
  assert.equal(databaseOrderKeyBetween("1024", "2048"), "1536")
  assert.equal(databaseOrderKeyBetween("2048", null), "3072")
})

test("database order midpoint reports precision exhaustion and reversed anchors", () => {
  assert.equal(databaseOrderKeyBetween("1", "1.0000000001"), null)
  assert.equal(databaseOrderKeyBetween("2", "1"), null)
  assert.equal(
    databaseOrderKeyBetween("99999999999999999999.9999999999", null),
    null,
  )
})
