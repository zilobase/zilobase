import assert from "node:assert/strict"
import { test } from "vitest"

import { buildLegacyDatabaseChangeset } from "./legacy-changeset"

test("legacy removals become typed v2 changes without a reset", () => {
  assert.deepEqual(buildLegacyDatabaseChangeset({
    changed: ["views", "properties", "rows"],
    delta: {
      removedPropertyIds: ["property-1"],
      removedRowIds: ["row-1"],
      removedViewIds: ["view-1"],
    },
  }), {
    areas: ["views", "properties", "records"],
    changes: {
      removedPropertyIds: ["property-1"],
      removedRecordIds: ["row-1"],
      removedViewIds: ["view-1"],
    },
  })
})

test("partial legacy entities and standalone values require a reset", () => {
  const changeset = buildLegacyDatabaseChangeset({
    changed: ["rows", "values"],
    delta: {
      rows: [{ id: "row-1", position: 3 }],
      values: [{
        pageId: "page-1",
        propertyId: "property-1",
        updatedAt: "2026-09-14T00:00:00.000Z",
        value: "Done",
      }],
    },
  })
  assert.equal(changeset.requiresReset, true)
  assert.deepEqual(changeset.areas, ["records"])
  assert.deepEqual(changeset.changes, {})
})

test("oversized complete removal lists emit reset instead of truncated changes", () => {
  const changeset = buildLegacyDatabaseChangeset({
    changed: ["rows"],
    delta: {
      removedRowIds: Array.from({ length: 1_000 }, (_, index) =>
        `row-${index}-${"x".repeat(100)}`
      ),
    },
  })
  assert.equal(changeset.requiresReset, true)
  assert.deepEqual(changeset.changes, {})
})
