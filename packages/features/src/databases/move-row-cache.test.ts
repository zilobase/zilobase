import assert from "node:assert/strict"
import test from "node:test"

import { moveDatabaseRow } from "./hooks"
import { createTestDatabasePayload } from "./test-helpers"

test("moveDatabaseRow reorders rows and updates an existing group value", () => {
  const payload = createTestDatabasePayload()
  const next = moveDatabaseRow(payload, {
    databaseId: "database-1",
    groupPropertyId: "property-status",
    groupValue: "Done",
    rowId: "row-1",
    rowIds: ["row-2", "row-1"],
  })

  assert.deepEqual(
    next?.rows.map((row) => [row.id, row.position]),
    [
      ["row-2", 0],
      ["row-1", 1],
    ],
  )
  assert.equal(
    next?.values.find(
      (value) =>
        value.pageId === "page-1" &&
        value.propertyId === "property-status",
    )?.value,
    "Done",
  )
})

test("moveDatabaseRow creates a missing group value for the moved row", () => {
  const payload = createTestDatabasePayload()
  const next = moveDatabaseRow(payload, {
    databaseId: "database-1",
    groupPropertyId: "property-status",
    groupValue: "In progress",
    rowId: "row-2",
    rowIds: ["row-2", "row-1"],
  })
  const value = next?.values.find(
    (candidate) =>
      candidate.pageId === "page-2" &&
      candidate.propertyId === "property-status",
  )

  assert.equal(value?.value, "In progress")
  assert.match(value?.id ?? "", /^optimistic-property-value-/)
})
