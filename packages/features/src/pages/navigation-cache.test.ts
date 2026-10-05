import assert from "node:assert/strict";
import test from "node:test";
import { TestQueryClient as QueryClient } from "../data/testing";

import { applyNavigationDeltaToCache } from "./navigation-cache";
import { resolveNavigationReference, type PageNavigationReference } from "./cache";
import { pagesQueryKey } from "./queries";
import type { PageNavigationPayload } from "./contracts";

const page = {
  createdAt: "2026-08-31T00:00:00.000Z",
  id: "page-1",
  name: "Created",
  type: "pageblock",
  updatedAt: "2026-08-31T00:00:00.000Z",
  url: "#",
  workspaceId: "workspace-1",
};

test("applies local navigation deltas to loaded snapshots", () => {
  const client = new QueryClient();
  const key = pagesQueryKey("workspace-1");
  client.setQueryData<PageNavigationPayload>(key, {
    databases: [],
    pages: [],
    placements: [],
  });
  assert.equal(
    applyNavigationDeltaToCache(client, "workspace-1", {
      upsertPages: [page],
    }),
    true,
  );
  assert.deepEqual(
    resolveNavigationReference(client, client.getQueryData<PageNavigationReference>(key)!).pages,
    [page],
  );
  client.clear();
});

test("invalidates navigation when no snapshot is loaded", () => {
  const client = new QueryClient();
  const key = pagesQueryKey("workspace-1");
  client.getQueryCache().build(client, {
    queryFn: async () => ({ databases: [], pages: [], placements: [] }),
    queryKey: key,
  });
  assert.equal(
    applyNavigationDeltaToCache(client, "workspace-1", {
      upsertPages: [page],
    }),
    false,
  );
  assert.equal(client.getQueryState(key)?.isInvalidated, true);
});

test("database deltas invalidate instead of overwriting revisioned navigation", () => {
  const client = new QueryClient();
  const key = pagesQueryKey("workspace-1");
  const database = {
    id: "database",
    workspaceId: "workspace-1",
    pageId: null,
    name: "Confirmed",
    views: [],
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    metadataState: { version: 5, primarySource: null },
  };
  client.setQueryData(key, { pages: [], placements: [], databases: [database] });
  applyNavigationDeltaToCache(client, "workspace-1", {
    upsertDatabases: [{ ...database, name: "Stale" }],
    removeDatabaseIds: ["database"],
  });
  assert.equal(client.getQueryData<PageNavigationPayload>(key)?.databases[0]?.name, "Confirmed");
  assert.equal(client.getQueryState(key)?.isInvalidated, true);
  client.clear();
});
