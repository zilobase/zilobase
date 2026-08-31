import assert from "node:assert/strict"
import { test } from "vitest"

import type { DatabaseContextPayload } from "../shared/types"
import { buildDatabaseMarkdown } from "./build-database-markdown"

const nativeSchema = createSchema({
  activeSourceId: "source-native",
  databaseId: "database-host",
  databaseName: "Bug Tracking",
  sourceName: "Bugs",
  views: [
    { dataSourceId: "source-native", id: "view-table", name: "All Bugs", position: 0, type: "table" },
    { dataSourceId: "source-native", id: "view-board", name: "Bug Status", position: 1, type: "kanban" },
    { dataSourceId: "source-attached", id: "view-linked", name: "External Bugs", position: 2, type: "table" },
  ],
})
nativeSchema.dataSources.push({
  id: "source-attached",
  name: "Partner Bugs",
  parentDatabaseId: "database-partner",
})

const attachedSchema = createSchema({
  activeSourceId: "source-attached",
  databaseId: "database-partner",
  databaseName: "Partner Bug Tracking",
  sourceName: "Partner Bugs",
  views: [],
})

test("database context groups views beneath explicit native and attached source ids", () => {
  const markdown = buildDatabaseMarkdown(nativeSchema, {
    "source-attached": attachedSchema,
  })

  assert.match(markdown, /Host database ID: database-host/)
  assert.match(markdown, /Data source: Bugs \(native\)[\s\S]*Source ID: source-native[\s\S]*View: All Bugs \(table\)[\s\S]*View: Bug Status \(kanban\)/)
  assert.match(markdown, /Data source: Partner Bugs \(attached\)[\s\S]*Source ID: source-attached[\s\S]*Parent database ID: database-partner[\s\S]*View: External Bugs \(table\)/)
})

function createSchema(input: {
  activeSourceId: string
  databaseId: string
  databaseName: string
  sourceName: string
  views: DatabaseContextPayload["views"]
}): DatabaseContextPayload {
  return {
    activeDataSource: {
      id: input.activeSourceId,
      name: input.sourceName,
      parentDatabaseId: input.databaseId,
    },
    dataSources: [{
      id: input.activeSourceId,
      name: input.sourceName,
      parentDatabaseId: input.databaseId,
    }],
    database: {
      id: input.databaseId,
      name: input.databaseName,
      pageId: null,
    },
    properties: [],
    rowCount: 0,
    rows: [],
    values: [],
    views: input.views,
  }
}
