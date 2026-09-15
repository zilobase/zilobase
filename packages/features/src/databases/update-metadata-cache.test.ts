import assert from "node:assert/strict"
import test from "node:test"

import {
  updateDatabaseViewInNavigation,
} from "./mutation-hooks"
import { createTestDatabasePayload } from "./test-helpers"

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
