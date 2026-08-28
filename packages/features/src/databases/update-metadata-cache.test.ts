import assert from "node:assert/strict"
import test from "node:test"

import {
  updateDatabasePropertyInPayload,
  updateDatabaseViewInNavigation,
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

test("updateDatabaseViewInNavigation updates the sidebar view name and icon", () => {
  const payload = createTestDatabasePayload()
  const navigation = {
    databases: [{ ...payload.database, views: payload.views }],
    pages: [],
    placements: [],
  }
  const next = updateDatabaseViewInNavigation(navigation, {
    config: { icon: "😇" },
    databaseId: "database-1",
    databaseViewId: "view-table",
    name: "Roadmap",
  })
  const view = next?.databases[0]?.views[0]

  assert.equal(view?.name, "Roadmap")
  assert.deepEqual(view?.config, { icon: "😇" })
  assert.equal(navigation.databases[0]?.views[0]?.name, "Table")
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

test("updateDatabasePropertyInPayload clears date values for select-like types", () => {
  const payload = createTestDatabasePayload()
  payload.properties[0]!.property.type = "date"
  payload.values[0]!.value = { start: "2026-07-14" }

  const next = updateDatabasePropertyInPayload(payload, {
    databaseId: "database-1",
    databasePropertyId: "column-status",
    type: "multi_select",
  })

  assert.equal(next?.values[0]?.value, null)
})

test("updateDatabasePropertyInPayload preserves date ranges as text", () => {
  const payload = createTestDatabasePayload()
  payload.properties[0]!.property.type = "date"
  payload.values[0]!.value = {
    end: "2026-07-16",
    start: "2026-07-14",
  }

  const next = updateDatabasePropertyInPayload(payload, {
    databaseId: "database-1",
    databasePropertyId: "column-status",
    type: "text",
  })

  assert.equal(next?.values[0]?.value, "2026-07-14 - 2026-07-16")
})
