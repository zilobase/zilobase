import assert from "node:assert/strict"
import test from "node:test"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { useLiveInfiniteQuery, useLiveQuery } from "@tanstack/react-db"

test("pinned TanStack DB client entrypoints are available", () => {
  assert.equal(typeof queryCollectionOptions, "function")
  assert.equal(typeof useLiveInfiniteQuery, "function")
  assert.equal(typeof useLiveQuery, "function")
})
