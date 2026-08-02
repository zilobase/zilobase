import assert from "node:assert/strict";
import { test } from "vitest";
import { PageGraph } from "./page-graph";

test("getPrimaryNestedPageIds skips linked children", () => {
  const graph = new PageGraph({
    pages: [{ id: "parent" }, { id: "primary" }, { id: "linked" }],
    placements: [
      {
        itemId: "primary",
        itemKind: "page",
        parentId: "parent",
        parentKind: "page",
        placementKind: "primary",
      },
      {
        itemId: "linked",
        itemKind: "page",
        parentId: "parent",
        parentKind: "page",
        placementKind: "linked",
      },
      {
        itemId: "linked",
        itemKind: "page",
        parentId: "elsewhere",
        parentKind: "page",
        placementKind: "primary",
      },
    ],
  });

  assert.deepEqual(graph.getNestedPageIds("parent").sort(), [
    "linked",
    "parent",
    "primary",
  ]);
  assert.deepEqual(graph.getPrimaryNestedPageIds("parent").sort(), [
    "parent",
    "primary",
  ]);
});

test("getAncestorIds includes embedded database row parents", () => {
  const graph = new PageGraph({
    databaseRecords: [{ id: "database", pageId: "database-page" }],
    databaseRows: [{ databaseId: "database", pageId: "row-page" }],
    pages: [{ id: "host-page" }, { id: "database-page" }, { id: "row-page" }],
    placements: [
      {
        itemId: "database-page",
        itemKind: "page",
        parentId: "host-page",
        parentKind: "page",
        placementKind: "linked",
      },
    ],
  });

  assert.deepEqual(graph.getAncestorIds("row-page"), [
    "row-page",
    "database-page",
    "host-page",
  ]);
});

test("getAncestorIds excludes ordinary linked pages", () => {
  const graph = new PageGraph({
    pages: [{ id: "host-page" }, { id: "linked-page" }],
    placements: [
      {
        itemId: "linked-page",
        itemKind: "page",
        parentId: "host-page",
        parentKind: "page",
        placementKind: "linked",
      },
    ],
  });

  assert.deepEqual(graph.getAncestorIds("linked-page"), ["linked-page"]);
});

test("hasOwnedRootAccess supports multiple embedded database parents", () => {
  const graph = new PageGraph({
    databaseRecords: [{ id: "database", pageId: "database-page" }],
    databaseRows: [{ databaseId: "database", pageId: "row-page" }],
    pages: [
      { createdById: "first-owner", id: "first-host" },
      { createdById: "second-owner", id: "second-host" },
      { createdById: "database-owner", id: "database-page" },
      { createdById: "row-owner", id: "row-page" },
    ],
    placements: [
      {
        itemId: "database-page",
        itemKind: "page",
        parentId: "first-host",
        parentKind: "page",
        placementKind: "linked",
      },
      {
        itemId: "database-page",
        itemKind: "page",
        parentId: "second-host",
        parentKind: "page",
        placementKind: "linked",
      },
    ],
  });
  const ancestorIds = graph.getAncestorIds("row-page");

  assert.equal(graph.hasOwnedRootAccess(ancestorIds, "first-owner"), true);
  assert.equal(graph.hasOwnedRootAccess(ancestorIds, "second-owner"), true);
  assert.equal(graph.hasOwnedRootAccess(ancestorIds, "database-owner"), false);
});

test("database indexes preserve rows and de-duplicate requested page ids", () => {
  const graph = new PageGraph({
    databaseRecords: [
      { id: "first-database", pageId: "shared-page" },
      { id: "second-database", pageId: "shared-page" },
    ],
    databaseRows: [
      { databaseId: "first-database", pageId: "first-row" },
      { databaseId: "second-database", pageId: "second-row" },
    ],
    pages: [
      { id: "shared-page" },
      { id: "first-row" },
      { id: "second-row" },
    ],
  });

  assert.deepEqual(
    graph.getDatabaseIdsForPageIds(["shared-page", "shared-page"]),
    ["first-database", "second-database"],
  );
  assert.deepEqual(graph.getNestedDatabasePageIds("first-database"), [
    "first-row",
  ]);
  assert.deepEqual(graph.getNestedDatabasePageIds("second-database"), [
    "second-row",
  ]);
});

test("accessible traversal stops at inaccessible parents and children", () => {
  const graph = new PageGraph({
    databaseRecords: [{ id: "database", pageId: "database-page" }],
    databaseRows: [{ databaseId: "database", pageId: "row-page" }],
    pages: [
      { id: "root" },
      { id: "child" },
      { id: "grandchild" },
      { id: "database-page" },
      { id: "row-page" },
    ],
    placements: [
      {
        itemId: "child",
        itemKind: "page",
        parentId: "root",
        parentKind: "page",
        placementKind: "primary",
      },
      {
        itemId: "grandchild",
        itemKind: "page",
        parentId: "child",
        parentKind: "page",
        placementKind: "primary",
      },
    ],
  });

  assert.deepEqual(
    graph.getNestedPageIds("root", new Set(["root", "grandchild"])),
    ["root"],
  );
  assert.deepEqual(
    graph.getNestedDatabasePageIds("database", new Set()),
    [],
  );
  assert.deepEqual(graph.getPrimaryNestedDatabasePageIds("database"), [
    "row-page",
  ]);
  assert.deepEqual(
    graph.getDatabaseIdsForPageIds(
      ["database-page", "database-page"],
      new Set(),
    ),
    [],
  );
  assert.deepEqual(graph.getNestedDatabasePageIds("missing"), []);
});

test("primary paths are cycle-safe and include database row parents", () => {
  const graph = new PageGraph({
    databaseRecords: [{ id: "database", pageId: "database-page" }],
    databaseRows: [{ databaseId: "database", pageId: "row-page" }],
    pages: [
      { id: "root", name: "Root" },
      { id: "child", name: "Child" },
      { id: "database-page", name: "Database" },
      { id: "row-page", name: "Row" },
    ],
    placements: [
      {
        itemId: "child",
        itemKind: "page",
        parentId: "root",
        parentKind: "page",
        placementKind: "primary",
      },
      {
        itemId: "root",
        itemKind: "page",
        parentId: "child",
        parentKind: "page",
        placementKind: "primary",
      },
    ],
  });

  assert.equal(graph.getPrimaryParentId("child"), "root");
  assert.equal(graph.getPrimaryParentId("missing"), null);
  assert.equal(
    graph.getPagePath(
      { id: "child", name: "Child" },
      (title) => title.toUpperCase(),
    ),
    "ROOT / CHILD",
  );
  assert.equal(graph.getPrimaryParentId("row-page"), "database-page");
  assert.equal(
    graph.getPagePath({ id: "row-page", name: "Row" }, (title) => title),
    "Database / Row",
  );
});

test("invalid placements and orphan database rows do not enter the graph", () => {
  const graph = new PageGraph({
    databaseRows: [{ databaseId: "orphan", pageId: "row-page" }],
    pages: [{ id: "root" }, { id: "page" }, { id: "row-page" }],
    placements: [
      {
        itemId: "page",
        itemKind: "page",
        parentId: "root",
        parentKind: "database",
        placementKind: "primary",
      },
      {
        itemId: "database",
        itemKind: "database",
        parentId: "root",
        parentKind: "page",
        placementKind: "linked",
      },
      {
        itemId: "page",
        itemKind: "page",
        parentId: "root",
        parentKind: "page",
        placementKind: "database_row",
      },
    ],
  });

  assert.deepEqual(graph.getNestedPageIds("root"), ["root"]);
  assert.deepEqual(graph.getAncestorIds("missing"), []);
  assert.equal(graph.hasOwnedRootAccess(["missing"], "user"), false);
  assert.equal(graph.getPrimaryParentId("row-page"), null);
});
