import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import {
  databaseBootstrapQueryKey,
  sessionIdForQueries,
} from "./keys";
import { databaseBootstrapQueryOptions } from "./bootstrap";
import { databaseBootstrapResponseSchema } from "../core/entities";

const bootstrap = {
  database: {
    accessLevel: "full",
    config: {},
    createdAt: "2026-09-08T00:00:00.000Z",
    deletedAt: null,
    id: "database-1",
    name: "Projects",
    pageId: null,
    updatedAt: "2026-09-08T00:00:00.000Z",
    version: 3,
    workspaceId: "workspace-1",
  },
  dataSources: [],
  properties: [],
  views: [],
};

test("bootstrap key includes session/host/view/deleted", () => {
  assert.deepEqual(
    databaseBootstrapQueryKey("session-1", { databaseId: "database-1" }),
    ["db", "session-1", "database-1", "bootstrap", null, false],
  );
  assert.deepEqual(
    databaseBootstrapQueryKey("public", {
      databaseId: "database-1",
      includeDeleted: true,
      viewId: "view-1",
    }),
    ["db", "public", "database-1", "bootstrap", "view-1", true],
  );
  assert.equal(sessionIdForQueries(null), "public");
  assert.equal(sessionIdForQueries("session-1"), "session-1");
});

test("bootstrap fetch parses and validates", async () => {
  const seen: string[] = [];
  const apiFetch = (async (path: string) => {
    seen.push(path);
    return bootstrap;
  }) as unknown as import("../../shared/api-fetcher").ApiFetcher;
  const options = databaseBootstrapQueryOptions(
    apiFetch,
    "session-1",
    { databaseId: "database-1", viewId: "view-1" },
  );
  const data = await options.queryFn();
  assert.deepEqual(data, databaseBootstrapResponseSchema.parse(bootstrap));
  assert.equal(
    seen[0],
    "/databases/database-1/bootstrap?viewId=view-1",
  );
});

test("bootstrap prefer-newest guard keeps newer cached version", async () => {
  const queryClient = new QueryClient();
  try {
    const scope = { databaseId: "database-1" };
    const key = databaseBootstrapQueryKey("session-1", scope);
    queryClient.setQueryData(key, { ...bootstrap });
    const stale = {
      ...bootstrap,
      database: { ...bootstrap.database, version: 1 },
    };
    const apiFetch = (async () =>
      stale) as unknown as import("../../shared/api-fetcher").ApiFetcher;
    const options = databaseBootstrapQueryOptions(
      apiFetch,
      "session-1",
      scope,
      queryClient,
    );
    const data = await options.queryFn();
    assert.equal(data.database.version, 3);
  } finally {
    queryClient.clear();
  }
});
