import assert from "node:assert/strict"
import { test } from "vitest"

import { getDatabasePropertyEntity } from "./metadata-entities"

test("property entities omit persistence-only soft-delete fields", async () => {
  const now = new Date("2026-09-14T00:00:00.000Z")
  const records = [{
    column: {
      createdAt: now,
      dataSourceId: "source-1",
      id: "column-1",
      position: 2,
      propertyId: "property-1",
      updatedAt: now,
      visible: true,
      width: null,
    },
    property: {
      config: null,
      createdAt: now,
      deletedAt: null,
      deletedById: null,
      id: "property-1",
      name: "Status",
      type: "status",
      updatedAt: now,
      workspaceId: "workspace-1",
    },
  }]
  const transaction = {
    select() {
      return {
        from() {
          return {
            innerJoin() {
              return {
                where() {
                  return { async limit() { return records } }
                },
              }
            },
          }
        },
      }
    },
  }
  const entity = await getDatabasePropertyEntity(
    { transaction } as never,
    "column-1",
  )
  assert.deepEqual(entity.property, {
    config: null,
    createdAt: now.toISOString(),
    id: "property-1",
    name: "Status",
    type: "status",
    updatedAt: now.toISOString(),
    workspaceId: "workspace-1",
  })
})
