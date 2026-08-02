import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  buildNavigationPlacements,
  softDeletePageItemPlacement,
  upsertPageItemPlacement,
} from "./page-item-placements";

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

test("buildNavigationPlacements filters invalid records and keeps the first duplicate", () => {
  const placements = buildNavigationPlacements({
    placementRecords: [
      {
        deletedAt: new Date(),
        id: "deleted",
        itemId: "deleted",
        itemKind: "page",
        workspaceId: "workspace",
        parentId: "parent",
        parentKind: "page",
        placementKind: "linked",
        position: 0,
      },
      {
        id: "invalid-parent",
        itemId: "item",
        itemKind: "page",
        workspaceId: "workspace",
        parentId: "parent",
        parentKind: "invalid",
        placementKind: "linked",
        position: 0,
      },
      {
        id: "invalid-item",
        itemId: "item",
        itemKind: "invalid",
        workspaceId: "workspace",
        parentId: "parent",
        parentKind: "page",
        placementKind: "linked",
        position: 0,
      },
      {
        id: "invalid-placement",
        itemId: "item",
        itemKind: "page",
        workspaceId: "workspace",
        parentId: "parent",
        parentKind: "page",
        placementKind: "invalid",
        position: 0,
      },
      {
        id: "second",
        itemId: "item",
        itemKind: "page",
        workspaceId: "workspace",
        parentId: "parent",
        parentKind: "page",
        placementKind: "linked",
        position: 2,
      },
      {
        id: "first",
        itemId: "item",
        itemKind: "page",
        workspaceId: "workspace",
        parentId: "parent",
        parentKind: "page",
        placementKind: "linked",
        position: 1,
      },
      {
        id: "alpha",
        itemId: "other",
        itemKind: "database",
        workspaceId: "workspace",
        parentId: "parent",
        parentKind: "database",
        placementKind: "primary",
        position: 2,
      },
    ],
  });

  assert.deepEqual(
    placements.map(({ id, position }) => ({ id, position })),
    [
      { id: "alpha", position: 2 },
      { id: "second", position: 2 },
    ],
  );
});

test("upsertPageItemPlacement writes stable defaults and conflict handling", async () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );
  let values: Record<string, unknown> | undefined;
  let conflictHandled = false;
  const tx = {
    insert() {
      return {
        values(input: Record<string, unknown>) {
          values = input;
          return {
            async onConflictDoNothing() {
              conflictHandled = true;
            },
          };
        },
      };
    },
    update() {},
  };

  await upsertPageItemPlacement(tx as never, {
    itemId: "item",
    itemKind: "page",
    parentId: "parent",
    parentKind: "page",
    placementKind: "primary",
    workspaceId: "workspace",
  });

  assert.equal(values?.id, "00000000-0000-4000-8000-000000000001");
  assert.equal(values?.position, 0);
  assert.equal(values?.sourceRowId, null);
  assert.equal(values?.createdAt, values?.updatedAt);
  assert.equal(conflictHandled, true);
  vi.restoreAllMocks();
});

test("upsertPageItemPlacement preserves supplied optional values", async () => {
  let values: Record<string, unknown> | undefined;
  const tx = {
    insert() {
      return {
        values(input: Record<string, unknown>) {
          values = input;
          return { async onConflictDoNothing() {} };
        },
      };
    },
    update() {},
  };

  await upsertPageItemPlacement(tx as never, {
    id: "placement",
    itemId: "item",
    itemKind: "page",
    parentId: "database",
    parentKind: "database",
    placementKind: "database_row",
    position: 4,
    sourceRowId: "row",
    workspaceId: "workspace",
  });

  assert.equal(values?.id, "placement");
  assert.equal(values?.position, 4);
  assert.equal(values?.sourceRowId, "row");
});

test("softDeletePageItemPlacement uses one timestamp for the targeted placement", async () => {
  let updateValues: Record<string, unknown> | undefined;
  let whereCalled = false;
  const tx = {
    insert() {},
    update() {
      return {
        set(input: Record<string, unknown>) {
          updateValues = input;
          return {
            async where() {
              whereCalled = true;
            },
          };
        },
      };
    },
  };

  await softDeletePageItemPlacement(tx as never, {
    item: { id: "item", kind: "page" },
    parentId: "parent",
    parentKind: "database",
    workspaceId: "workspace",
  });

  assert.equal(updateValues?.deletedAt, updateValues?.updatedAt);
  assert.ok(updateValues?.deletedAt instanceof Date);
  assert.equal(whereCalled, true);
});
