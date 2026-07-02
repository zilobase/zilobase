import assert from "node:assert/strict"
import test from "node:test"

import {
  updateDatabasePropertyInPayload,
  updateDatabaseViewInPayload,
} from "./hooks"
import { createTestDatabasePayload } from "./test-helpers"

test("updateDatabaseViewInPayload optimistically updates view visibility config", () => {
  const payload = createTestDatabasePayload()
  const next = updateDatabaseViewInPayload(payload, {
    config: { hiddenPropertyIds: ["column-status"] },
    databaseId: "database-1",
    databaseViewId: "view-table",
  })

  assert.deepEqual(next?.views[0]?.config, {
    hiddenPropertyIds: ["column-status"],
  })
  assert.notEqual(next?.views[0]?.updatedAt, payload.views[0]?.updatedAt)
})

test("updateDatabasePropertyInPayload optimistically updates property metadata", () => {
  const payload = createTestDatabasePayload()
  const next = updateDatabasePropertyInPayload(payload, {
    config: { hidden: true, wrapContent: true },
    databaseId: "database-1",
    databasePropertyId: "column-status",
    name: "State",
    visible: false,
    width: 240,
  })
  const property = next?.properties[0]

  assert.equal(property?.visible, false)
  assert.equal(property?.width, 240)
  assert.equal(property?.property.name, "State")
  assert.deepEqual(property?.property.config, {
    hidden: true,
    wrapContent: true,
  })
  assert.notEqual(property?.updatedAt, payload.properties[0]?.updatedAt)
})
