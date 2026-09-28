import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import { databaseBootstrapQueryKey, databaseWindowQueryKey } from "./keys";
import {
  fetchRecordWindow,
  confirmedWindowBootstrap,
  databaseWindowQueryOptions,
  DatabaseViewQueryChangedError,
  isWindowStaleError,
  prefetchDatabaseWindow,
  selectSameSourcePlaceholder,
} from "./records";
import type { DatabaseBootstrapResponse, DatabaseRecordWindowResponse } from "../core/entities";
import type { ApiFetcher } from "../../shared/api-fetcher";

function windowResponse(
  overrides: Partial<DatabaseRecordWindowResponse> = {},
): DatabaseRecordWindowResponse {
  return {
    queryHash: "q1",
    databaseVersion: 5,
    dataSourceVersion: 2,
    hasMore: false,
    offset: 0,
    records: [],
    snapshot: "snapshot-1",
    totalCount: 0,
    ...overrides,
  };
}

const scope = {
  databaseId: "database-1",
  dataSourceId: "data-source-1",
  queryHash: "q1",
  viewId: "view-1",
};

test("window key uses host root with source/query segments", () => {
  assert.deepEqual(databaseWindowQueryKey("session-1", scope), [
    "db",
    "session-1",
    "database-1",
    "window",
    "data-source-1",
    "q1",
    false,
  ]);
});

test("window key splits by query hash, not by view", () => {
  const siblingKey = databaseWindowQueryKey("session-1", {
    databaseId: scope.databaseId,
    dataSourceId: scope.dataSourceId,
    queryHash: scope.queryHash,
  });
  assert.deepEqual(siblingKey, databaseWindowQueryKey("session-1", scope));
  assert.notDeepEqual(
    databaseWindowQueryKey("session-1", {
      databaseId: scope.databaseId,
      dataSourceId: scope.dataSourceId,
      queryHash: "q2",
    }),
    databaseWindowQueryKey("session-1", scope),
  );
});

test("record window uses growing limit with offset 0", async () => {
  const seen: string[] = [];
  const apiFetch = (async (path: string) => {
    seen.push(path);
    return windowResponse({ totalCount: 120 });
  }) as unknown as import("../../shared/api-fetcher").ApiFetcher;
  const data = await fetchRecordWindow(apiFetch, scope, {
    limit: 100,
    snapshot: "snapshot-1",
  });
  assert.equal(data.totalCount, 120);
  assert.match(seen[0]!, /limit=100/);
  assert.match(seen[0]!, /offset=0/);
  assert.match(seen[0]!, /viewId=view-1/);
  assert.match(seen[0]!, /snapshot=snapshot-1/);
  assert.match(seen[0]!, /expectedQueryHash=q1/);
});

test("changed query responses never enter the old cache or retry its obsolete hash", async () => {
  for (const mode of ["response", "conflict", "continuation"] as const) {
    const client = new QueryClient();
    const key = databaseWindowQueryKey("session-1", scope);
    const metadataKey = databaseBootstrapQueryKey("session-1", scope);
    const otherSessionKey = databaseBootstrapQueryKey("other-session", scope);
    client.setQueryData(metadataKey, { marker: "metadata" });
    client.setQueryData(otherSessionKey, { marker: "private" });
    const original = {
      pages: [windowResponse()],
      pageParams: [{ limit: 50, snapshot: undefined }],
    };
    client.setQueryData(key, original);
    let calls = 0;
    const fetch = (async () => {
      calls++;
      if (mode === "continuation" && calls === 1) throw { code: "WINDOW_STALE" };
      if (mode !== "response") throw { status: 409, body: { code: "VIEW_QUERY_CHANGED" } };
      return windowResponse({ queryHash: "q2" });
    }) as ApiFetcher;
    try {
      await assert.rejects(
        client.fetchInfiniteQuery({
          ...databaseWindowQueryOptions(fetch, "session-1", scope, 50, client),
          staleTime: 0,
        }),
        DatabaseViewQueryChangedError,
      );
      assert.equal(calls, mode === "continuation" ? 2 : 1);
      assert.deepEqual(client.getQueryData(key), original);
      assert.equal(client.getQueryState(metadataKey)?.isInvalidated, true);
      assert.equal(client.getQueryState(otherSessionKey)?.isInvalidated, false);
    } finally {
      client.clear();
    }
  }
});

test("record scope selects newest confirmed metadata without crossing session or deleted scope", () => {
  const client = new QueryClient();
  const now = "2026-09-29T00:00:00.000Z";
  const snapshot: DatabaseBootstrapResponse = {
    database: {
      id: scope.databaseId,
      version: 1,
      config: {},
      name: "Database",
      pageId: null,
      workspaceId: "workspace",
      accessLevel: "full",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    dataSources: [],
    properties: [],
    views: [],
  };
  const rootKey = databaseBootstrapQueryKey("session-1", { databaseId: scope.databaseId });
  client.setQueryData(rootKey, snapshot);
  client.setQueryData(databaseBootstrapQueryKey("other-session", scope), {
    ...snapshot,
    database: { ...snapshot.database, version: 100 },
  });
  client.setQueryData(databaseBootstrapQueryKey("session-1", { ...scope, includeDeleted: true }), {
    ...snapshot,
    database: { ...snapshot.database, version: 200 },
  });
  try {
    assert.equal(
      confirmedWindowBootstrap(client, "session-1", scope),
      client.getQueryData(rootKey),
    );
    const viewKey = databaseBootstrapQueryKey("session-1", scope);
    client.setQueryData(viewKey, { ...snapshot, database: { ...snapshot.database, version: 2 } });
    assert.equal(
      confirmedWindowBootstrap(client, "session-1", scope),
      client.getQueryData(viewKey),
    );
    assert.equal(confirmedWindowBootstrap(client, "absent", scope), undefined);
  } finally {
    client.clear();
  }
});

test("WINDOW_STALE retries once without snapshot then throws", async () => {
  let calls = 0;
  const apiFetch = (async (path: string) => {
    calls += 1;
    if (calls === 1) {
      throw { code: "WINDOW_STALE", status: 409 };
    }
    return windowResponse({ databaseVersion: 6 });
  }) as unknown as import("../../shared/api-fetcher").ApiFetcher;
  const data = await fetchRecordWindow(apiFetch, scope, {
    limit: 50,
    snapshot: "stale",
  });
  assert.equal(data.databaseVersion, 6);
  assert.equal(calls, 2);
  assert.equal(isWindowStaleError({ status: 409, body: { code: "WINDOW_STALE" } }), true);

  const failing = (async () => {
    throw { code: "WINDOW_STALE", status: 409 };
  }) as unknown as import("../../shared/api-fetcher").ApiFetcher;
  await assert.rejects(() =>
    fetchRecordWindow(failing, scope, {
      limit: 50,
      snapshot: "stale",
    }),
  );
});

test("prefer-newest guard ignores stale incoming window", async () => {
  const queryClient = new QueryClient();
  try {
    const key = databaseWindowQueryKey("session-1", scope);
    const cached = windowResponse({ databaseVersion: 10, totalCount: 7 });
    queryClient.setQueryData(key, { pages: [cached], pageParams: [{ limit: 50 }] });
    const apiFetch = (async () =>
      windowResponse({
        databaseVersion: 8,
        totalCount: 1,
      })) as unknown as import("../../shared/api-fetcher").ApiFetcher;
    const data = await fetchRecordWindow(
      apiFetch,
      scope,
      { limit: 50, snapshot: undefined },
      queryClient,
      key,
    );
    assert.equal(data.databaseVersion, 10);
    assert.equal(data.totalCount, 7);
  } finally {
    queryClient.clear();
  }
});

test("placeholder keeps the previous window within one data source", () => {
  const previousData = {
    pageParams: [{ limit: 50, snapshot: undefined }],
    pages: [windowResponse({ totalCount: 3 })],
  };
  const sameSourceKey = databaseWindowQueryKey("session-1", {
    databaseId: "database-1",
    dataSourceId: "data-source-1",
    queryHash: "q-old",
  });
  assert.equal(
    selectSameSourcePlaceholder(previousData, sameSourceKey, "data-source-1"),
    previousData,
  );
});

test("placeholder drops rows from another data source", () => {
  const previousData = {
    pageParams: [{ limit: 50, snapshot: undefined }],
    pages: [windowResponse({ totalCount: 3 })],
  };
  const otherSourceKey = databaseWindowQueryKey("session-1", {
    databaseId: "database-1",
    dataSourceId: "data-source-2",
    queryHash: "q-old",
  });
  assert.equal(
    selectSameSourcePlaceholder(previousData, otherSourceKey, "data-source-1"),
    undefined,
  );
  assert.equal(selectSameSourcePlaceholder(previousData, undefined, "data-source-1"), undefined);
});

test("prefetch warms an uncached window and skips a cached one", async () => {
  const queryClient = new QueryClient();
  try {
    let calls = 0;
    const apiFetch = (async () => {
      calls += 1;
      return windowResponse({ totalCount: 4 });
    }) as unknown as import("../../shared/api-fetcher").ApiFetcher;
    await prefetchDatabaseWindow(queryClient, apiFetch, "session-1", scope, 50);
    assert.equal(calls, 1);
    const cached = queryClient.getQueryData(databaseWindowQueryKey("session-1", scope)) as {
      pages: DatabaseRecordWindowResponse[];
    };
    assert.equal(cached.pages[0]?.totalCount, 4);
    await prefetchDatabaseWindow(queryClient, apiFetch, "session-1", scope, 50);
    assert.equal(calls, 1);
  } finally {
    queryClient.clear();
  }
});
