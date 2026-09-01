import assert from "node:assert/strict"
import test from "node:test"

import type { DatabaseProperty } from "./queries"
import {
  createDatabaseRowSnapshot,
  type DatabaseRowSnapshotSource,
} from "./row-snapshot"

function property(id: string, name: string, type: string, config?: unknown): DatabaseProperty {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    dataSourceId: "source-1",
    id: `wrapper-${id}`,
    position: 0,
    property: {
      config,
      createdAt: "2026-01-01T00:00:00.000Z",
      id,
      name,
      type,
      updatedAt: "2026-01-01T00:00:00.000Z",
      workspaceId: "workspace-1",
    },
    propertyId: id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    visible: true,
  }
}

const properties = [
  property("score", "Score", "number"),
  property("formula", "Double", "formula", { formula: "Score * 2" }),
  property("related", "Related", "relation"),
]

function source(pageId: string, score: string, related: string[] = []): DatabaseRowSnapshotSource {
  return {
    properties,
    propertyValuesByKey: {
      [`${pageId}:related`]: related,
      [`${pageId}:score`]: score,
    },
    row: {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `row-${pageId}`,
      page: { name: pageId },
      pageId,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  }
}

test("materializes raw and computed values for server evaluation", () => {
  const snapshot = createDatabaseRowSnapshot(source("page-1", "4"), {
    now: new Date("2026-01-01T00:00:00.000Z"),
    timezone: "UTC",
  })

  assert.equal(snapshot.values.score, 4)
  assert.equal(snapshot.values.formula, 8)
  assert.deepEqual(snapshot.computed.formula, { ok: true, type: "number", value: 8 })
})

test("bounds relation traversal and suppresses cycles", () => {
  const sources = new Map([
    ["page-1", source("page-1", "1", ["page-2", "page-3"])],
    ["page-2", source("page-2", "2", ["page-1"])],
    ["page-3", source("page-3", "3")],
  ])
  const snapshot = createDatabaseRowSnapshot(sources.get("page-1")!, {
    maxRelatedRows: 1,
    maxRelationDepth: 4,
    resolveRelatedPage: (pageId) => sources.get(pageId) ?? null,
  })

  assert.deepEqual(
    snapshot.relations.related.map(({ pageId }) => pageId),
    ["page-2"],
  )
  assert.deepEqual(snapshot.relations.related[0]?.relations.related, [])
})
