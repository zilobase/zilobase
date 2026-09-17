import assert from "node:assert/strict"
import test from "node:test"

import {
  DATABASE_ORDER_KEY_SPACING,
  databaseOrderKeyAtPosition,
  databaseOrderKeyBetween,
  parseDatabaseOrderKey,
} from "./order-key"

function deterministicPositions(count: number) {
  let state = 0x5eed1234
  return Array.from({ length: count }, () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state % 10_000
  })
}

test("midpoints remain strictly between arbitrary representable neighbors", () => {
  for (const position of deterministicPositions(1_000)) {
    const lower = databaseOrderKeyAtPosition(position)
    const upper = databaseOrderKeyAtPosition(position + 1)
    const midpoint = databaseOrderKeyBetween(lower, upper)

    assert.notEqual(midpoint, null)
    assert.ok(parseDatabaseOrderKey(lower) < parseDatabaseOrderKey(midpoint!))
    assert.ok(parseDatabaseOrderKey(midpoint!) < parseDatabaseOrderKey(upper))
  }
})

test("start and end insertion preserve the standard spacing", () => {
  const first = databaseOrderKeyAtPosition(0)
  const last = databaseOrderKeyAtPosition(999)

  assert.equal(
    parseDatabaseOrderKey(first) - parseDatabaseOrderKey(
      databaseOrderKeyBetween(null, first)!,
    ),
    DATABASE_ORDER_KEY_SPACING,
  )
  assert.equal(
    parseDatabaseOrderKey(databaseOrderKeyBetween(last, null)!) -
      parseDatabaseOrderKey(last),
    DATABASE_ORDER_KEY_SPACING,
  )
})

test("visible anchors can locate a move without reordering hidden rows", () => {
  const beforeVisible = "1024"
  const hiddenKeys = ["2048", "3072"]
  const afterVisible = "4096"
  const moved = databaseOrderKeyBetween(beforeVisible, afterVisible)

  assert.equal(moved, "2560")
  assert.deepEqual(
    [...hiddenKeys].sort((left, right) =>
      Number(parseDatabaseOrderKey(left) - parseDatabaseOrderKey(right)),
    ),
    hiddenKeys,
  )
})

test("sub-item hierarchy does not affect canonical key uniqueness", () => {
  const rows = [
    { id: "parent", parentRowId: null, orderKey: databaseOrderKeyAtPosition(0) },
    { id: "child-a", parentRowId: "parent", orderKey: databaseOrderKeyAtPosition(1) },
    { id: "child-b", parentRowId: "parent", orderKey: databaseOrderKeyAtPosition(2) },
  ]

  assert.equal(new Set(rows.map((row) => row.orderKey)).size, rows.length)
  assert.deepEqual(rows.map((row) => row.parentRowId), [null, "parent", "parent"])
})

test("precision exhaustion requests rebalance before a colliding move", () => {
  assert.equal(databaseOrderKeyBetween("1", "1.0000000001"), null)

  const rebalanced = Array.from({ length: 1_000 }, (_, position) =>
    databaseOrderKeyAtPosition(position),
  )
  assert.equal(new Set(rebalanced).size, rebalanced.length)
  assert.equal(databaseOrderKeyBetween(rebalanced[10]!, rebalanced[11]!), "11776")
})
