import assert from "node:assert/strict"
import { test } from "vitest"

import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error"
import { resolveNeighborIndex } from "./ordering"

test("neighbor ordering inserts and moves without a full client ID list", () => {
  assert.deepEqual(resolveNeighborIndex({
    afterId: "a",
    beforeId: "c",
    ids: ["a", "hidden", "c"],
  }), { ids: ["a", "hidden", "c"], index: 1 })

  assert.deepEqual(resolveNeighborIndex({
    afterId: "c",
    beforeId: null,
    ids: ["a", "b", "c"],
    movingId: "a",
  }), { ids: ["b", "c"], index: 2 })
})

test("neighbor ordering accepts one surviving anchor and rejects reversed anchors", () => {
  assert.equal(resolveNeighborIndex({
    afterId: "deleted",
    beforeId: "b",
    ids: ["a", "b"],
  }).index, 1)

  assert.throws(
    () => resolveNeighborIndex({
      afterId: "b",
      beforeId: "a",
      ids: ["a", "b"],
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 409,
  )
})
