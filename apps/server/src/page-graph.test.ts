import assert from "node:assert/strict";
import test from "node:test";
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
