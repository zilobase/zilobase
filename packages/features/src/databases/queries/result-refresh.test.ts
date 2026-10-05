import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient } from "../../data/testing";
import { refreshRecordResults } from "./result-refresh";

test("record membership recovery reads only affected source windows in the same cache scope", () => {
  const client = new TestQueryClient();
  const requested: unknown[][] = [];
  client.invalidateQueries = async (filters) => {
    requested.push([...(filters?.queryKey ?? [])]);
  };
  const window = (cacheId: string) => ({
    pages: [
      {
        cacheId,
        dataSourceId: "source",
        recordIds: [],
        databaseVersion: 1,
        dataSourceVersion: 1,
        queryHash: "hash",
        hasMore: false,
        offset: 0,
        snapshot: "snapshot",
        totalCount: 0,
      },
    ],
    pageParams: [null],
  });
  const affected = ["db", "session", "host", "window", "source", "hash", false];
  const unrelated = ["db", "session", "host", "window", "other", "hash", false];
  const capability = ["db", "public", "host", "window", "source", "hash", false];
  client.setQueryData(affected, window("cache"));
  client.setQueryData(unrelated, window("cache"));
  client.setQueryData(capability, window("public-cache"));
  client.setQueryData(["db", "session", "host", "bootstrap"], { cacheId: "cache" });
  try {
    refreshRecordResults(client, "cache", { source: 2 });
    assert.deepEqual(requested, [affected]);
  } finally {
    client.clear();
  }
});
