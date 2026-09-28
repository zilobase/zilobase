import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { resolveDataSourceCommandScope } from "./scope";
import { createTestDatabasePayload, setTestDatabaseClientState } from "./test-helpers";

test("source resolution never borrows another session or guesses a host's first source", () => {
  const client = new QueryClient();
  const payload = createTestDatabasePayload();
  setTestDatabaseClientState(client, payload);
  try {
    assert.throws(
      () => resolveDataSourceCommandScope(client, "other-session", "data-source-1"),
      /not loaded/,
    );
    assert.throws(
      () => resolveDataSourceCommandScope(client, "test-session", "database-1"),
      /not loaded/,
    );
    assert.deepEqual(resolveDataSourceCommandScope(client, "test-session", "data-source-1"), {
      dataSourceId: "data-source-1",
      hostDatabaseId: "database-1",
    });
    assert.deepEqual(resolveDataSourceCommandScope(client, "other-session", "source", "host"), {
      dataSourceId: "source",
      hostDatabaseId: "host",
    });
  } finally {
    client.clear();
  }
});
