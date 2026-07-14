import assert from "node:assert/strict"
import test from "node:test"

import type { DatabasePayload } from "./queries"
import { buildPagePropertiesPayloadFromDatabase } from "./row-page-properties"

const timestamp = "2026-07-13T00:00:00.000Z"

const payload = {
  database: { id: "database-1", version: 4 },
  properties: [
    {
      position: 1,
      property: {
        id: "date",
        name: "Date",
        type: "date",
        workspaceId: "workspace",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    {
      position: 0,
      property: {
        id: "status",
        name: "Status",
        type: "status",
        workspaceId: "workspace",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  ],
  rows: [],
  values: [],
} as unknown as DatabasePayload

test("database schemas produce empty page properties without a preview row", () => {
  const result = buildPagePropertiesPayloadFromDatabase(payload, null)

  assert.deepEqual(
    result?.properties.map((property) => property.id),
    ["status", "date"],
  )
  assert.deepEqual(result?.values, [])
})
