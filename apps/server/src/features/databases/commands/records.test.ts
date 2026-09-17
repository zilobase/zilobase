import assert from "node:assert/strict"
import { test } from "vitest"

import { RowMoveConflictError } from "./framework"
import { resolveAnchoredRowIndex } from "./records"

const rows = ["row-a", "row-hidden", "row-b", "row-c"].map((id) => ({ id }))

test("anchor placement supports start, end, and the gap between visible anchors", () => {
  assert.equal(resolveAnchoredRowIndex({
    afterRowId: null,
    beforeRowId: "row-a",
    rowId: "row-c",
    rows,
  }).index, 0)
  assert.equal(resolveAnchoredRowIndex({
    afterRowId: "row-c",
    beforeRowId: null,
    rowId: "row-a",
    rows,
  }).index, 3)

  const filtered = resolveAnchoredRowIndex({
    afterRowId: "row-a",
    beforeRowId: "row-b",
    rowId: "row-c",
    rows,
  })
  assert.equal(filtered.index, 1)
  assert.deepEqual(filtered.rows.map(({ id }) => id), ["row-a", "row-hidden", "row-b"])
})

test("one surviving anchor can place a move after the other is deleted", () => {
  assert.equal(resolveAnchoredRowIndex({
    afterRowId: "deleted-row",
    beforeRowId: "row-b",
    rowId: "row-c",
    rows,
  }).index, 2)
  assert.equal(resolveAnchoredRowIndex({
    afterRowId: "row-a",
    beforeRowId: "foreign-row",
    rowId: "row-c",
    rows,
  }).index, 1)
})

test("reversed or wholly invalid anchors return a typed move conflict", () => {
  for (const anchors of [
    { afterRowId: "row-b", beforeRowId: "row-a" },
    { afterRowId: "deleted-row", beforeRowId: null },
    { afterRowId: "deleted-row", beforeRowId: "foreign-row" },
  ]) {
    assert.throws(
      () => resolveAnchoredRowIndex({ ...anchors, rowId: "row-c", rows }),
      (error: unknown) =>
        error instanceof RowMoveConflictError && error.rowId === "row-c",
    )
  }
})

test("no anchors appends within the complete canonical sequence", () => {
  const placement = resolveAnchoredRowIndex({
    afterRowId: null,
    beforeRowId: null,
    rowId: "new-row",
    rows,
  })
  assert.equal(placement.index, rows.length)
})
