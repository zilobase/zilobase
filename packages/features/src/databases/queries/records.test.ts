import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import {
  databaseWindowQueryKey,
} from "./keys";
import {
  fetchRecordWindow,
  isWindowStaleError,
} from "./records";
import type { DatabaseRecordWindowResponse } from "../core/entities";

function windowResponse(
  overrides: Partial<DatabaseRecordWindowResponse> = {},
): DatabaseRecordWindowResponse {
  return {
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
  assert.deepEqual(
    databaseWindowQueryKey("session-1", scope),
    [
      "db",
      "session-1",
      "database-1",
      "window",
      "data-source-1",
      "q1",
      false,
    ],
  );
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
  await assert.rejects(() => fetchRecordWindow(failing, scope, {
    limit: 50,
    snapshot: "stale",
  }));
});

test("prefer-newest guard ignores stale incoming window", async () => {
  const queryClient = new QueryClient();
  try {
    const key = databaseWindowQueryKey("session-1", scope);
    const cached = windowResponse({ databaseVersion: 10, totalCount: 7 });
    queryClient.setQueryData(key, { pages: [cached], pageParams: [{ limit: 50 }] });
    const apiFetch = (async () =>
      windowResponse({ databaseVersion: 8, totalCount: 1 })) as unknown as import("../../shared/api-fetcher").ApiFetcher;
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
