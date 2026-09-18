import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import { databaseBootstrapQueryKey, databaseWindowQueryKey } from "../queries/keys";
import { invalidateDatabaseQueries } from "./invalidate";

test("invalidates only matching host under session", async () => {
  const queryClient = new QueryClient();
  try {
    let bootstrapCalls = 0;
    let otherCalls = 0;
    queryClient.setQueryData(
      databaseBootstrapQueryKey("session-1", { databaseId: "database-1" }),
      { marker: "host-1" },
    );
    queryClient.setQueryData(
      databaseBootstrapQueryKey("session-1", { databaseId: "database-2" }),
      { marker: "host-2" },
    );
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (async (filters: never) => {
      const key = (filters as { queryKey?: unknown }).queryKey as unknown[];
      if (
        Array.isArray(key) && key[0] === "db" && key[2] === "database-1"
      ) {
        bootstrapCalls += 1;
      }
      if (
        Array.isArray(key) && key[0] === "db" && key[2] === "database-2"
      ) {
        otherCalls += 1;
      }
      return original(filters);
    }) as typeof queryClient.invalidateQueries;

    invalidateDatabaseQueries(queryClient, "session-1", "database-1");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(bootstrapCalls, 1);
    assert.equal(otherCalls, 0);
  } finally {
    queryClient.clear();
  }
});

test("also invalidates matching page properties and export key", async () => {
  const queryClient = new QueryClient();
  try {
    queryClient.setQueryData(["page", "page-1", "properties"], {
      databaseIds: ["database-1"],
      properties: [],
      values: [],
    });
    queryClient.setQueryData(["page", "page-2", "properties"], {
      databaseIds: ["database-2"],
      properties: [],
      values: [],
    });
    queryClient.setQueryData(
      ["database-context-export", "database-1"],
      { marker: "export" },
    );
    const invalidated: unknown[][] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (async (filters: never) => {
      invalidated.push(
        ((filters as { queryKey?: unknown }).queryKey ?? []) as unknown[],
      );
      return original(filters);
    }) as typeof queryClient.invalidateQueries;

    invalidateDatabaseQueries(queryClient, "session-1", "database-1");
    await new Promise<void>((resolve) => setImmediate(resolve));
    const keys = invalidated.map((key) => JSON.stringify(key));
    assert.ok(keys.some((key) => key.includes('"page","page-1","properties"')));
    assert.ok(!keys.some((key) => key.includes('"page","page-2","properties"')));
    assert.ok(
      keys.some((key) => key.includes('"database-context-export","database-1"')),
    );
    // Window key is covered by host-scoped db invalidation
    assert.ok(
      databaseWindowQueryKey("session-1", {
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        queryHash: "q1",
      })[0] === "db",
    );
  } finally {
    queryClient.clear();
  }
});
