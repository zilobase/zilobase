import assert from "node:assert/strict";
import test from "node:test";
import type { Page, PageDatabase, PageItemPlacement } from "../pages/contracts";
import { buildHomepageRows } from "./model";

const date = "2026-10-01T00:00:00.000Z";

const page = (id: string): Page => ({
  id,
  workspaceId: "workspace",
  type: "pageblock",
  name: id,
  url: "",
  createdAt: date,
  updatedAt: date,
});

const database = (id: string, pageId: string | null = null): PageDatabase => ({
  id,
  workspaceId: "workspace",
  pageId,
  name: id,
  createdAt: date,
  updatedAt: date,
  views: [],
});

const placement = (id: string, fields: Partial<PageItemPlacement>): PageItemPlacement => ({
  id,
  workspaceId: "workspace",
  parentKind: "page",
  parentId: "root",
  itemKind: "page",
  itemId: "leaf",
  placementKind: "primary",
  position: 0,
  ...fields,
});

test("Library source lookup preserves placement order, excludes linked placements and separates item kinds", () => {
  const rows = buildHomepageRows(
    {
      pages: [page("root"), page("linked"), page("leaf"), page("backing")],
      databases: [database("source-db"), database("leaf"), database("unplaced", "backing")],
      placements: [
        placement("link", { parentId: "linked", placementKind: "linked" }),
        placement("db-row", {
          parentKind: "database",
          parentId: "source-db",
          placementKind: "database_row",
        }),
        placement("primary", {}),
        placement("db-placement", { itemKind: "database" }),
      ],
    },
    [],
    "home",
  );
  const sources = new Map(rows.map((row) => [row.id, row.source]));
  assert.equal(sources.get("page:leaf"), "database:source-db");
  assert.equal(sources.get("database:leaf"), "page:root");
  assert.equal(sources.get("page:root"), "");
  assert.equal(sources.get("database:source-db"), "");
  assert.equal(sources.get("database:unplaced"), "page:backing");
});

test("Library source lookup keeps a first missing parent and ignores linked-only sources", () => {
  const rows = buildHomepageRows(
    {
      pages: [page("root"), page("leaf"), page("linked-only")],
      databases: [database("source-db")],
      placements: [
        placement("first", { parentId: "missing" }),
        placement("second", {
          parentKind: "database",
          parentId: "source-db",
          placementKind: "database_row",
        }),
        placement("link", { itemId: "linked-only", placementKind: "linked" }),
      ],
    },
    [],
    "home",
  );
  const sources = new Map(rows.map((row) => [row.id, row.source]));
  assert.equal(sources.get("page:leaf"), "");
  assert.equal(sources.get("page:linked-only"), "");
});

test("Library suppresses a container's source and retains a deleted leaf's source in Trash", () => {
  const navigation = {
    pages: [page("root"), page("container"), { ...page("leaf"), deletedAt: date }],
    databases: [],
    placements: [
      placement("container-placement", { itemId: "container" }),
      placement("leaf-placement", { parentId: "container" }),
    ],
  };
  const home = buildHomepageRows(navigation, [], "home");
  assert.equal(home.find((row) => row.id === "page:container")?.source, "");
  assert.equal(
    home.some((row) => row.id === "page:leaf"),
    false,
  );
  const trash = buildHomepageRows(navigation, [], "trash");
  assert.deepEqual(
    trash.map(({ id, source }) => [id, source]),
    [["page:leaf", "page:container"]],
  );
});
