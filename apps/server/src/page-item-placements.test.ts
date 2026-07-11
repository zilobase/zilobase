import assert from "node:assert/strict";
import test from "node:test";
import { buildNavigationPlacements } from "./page-item-placements";

test("buildNavigationPlacements keeps database row and page linked appearances", () => {
  const placements = buildNavigationPlacements({
    placementRecords: [
      {
        deletedAt: null,
        id: "database-row-placement",
        itemId: "row-page",
        itemKind: "page",
        workspaceId: "org",
        parentId: "database",
        parentKind: "database",
        placementKind: "database_row",
        position: 2,
        sourceRowId: "row",
      },
      {
        deletedAt: null,
        id: "primary-database-placement",
        itemId: "database",
        itemKind: "database",
        workspaceId: "org",
        parentId: "parent",
        parentKind: "page",
        placementKind: "primary",
        position: 0,
        sourceRowId: null,
      },
      {
        deletedAt: null,
        id: "linked-placement",
        itemId: "row-page",
        itemKind: "page",
        workspaceId: "org",
        parentId: "parent",
        parentKind: "page",
        placementKind: "linked",
        position: 1,
        sourceRowId: null,
      },
    ],
  });

  assert.deepEqual(
    placements.map((placement) => ({
      itemId: placement.itemId,
      parentId: placement.parentId,
      parentKind: placement.parentKind,
      placementKind: placement.placementKind,
    })),
    [
      {
        itemId: "database",
        parentId: "parent",
        parentKind: "page",
        placementKind: "primary",
      },
      {
        itemId: "row-page",
        parentId: "parent",
        parentKind: "page",
        placementKind: "linked",
      },
      {
        itemId: "row-page",
        parentId: "database",
        parentKind: "database",
        placementKind: "database_row",
      },
    ],
  );
});
