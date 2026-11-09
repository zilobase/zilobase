import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { pagesQueryKey } from "../pages/queries";
import { refreshAfterWorkspaceActions } from "./changes";
import type { ChatReadProgress } from "./tools";

const progress = (status: "running" | "completed", command = "row.change"): ChatReadProgress => ({
  canContinue: false,
  activities: [
    {
      id: "call-1",
      name: "workspace_action",
      action: "databases.update_rows",
      status,
      label: "Update rows",
      changes: [{ command, databaseId: "db-1" }],
    },
  ],
});

test("completed AI changes refresh affected database reads and the page tree once", async () => {
  const client = new QueryClient();
  client.setQueryData(["db", "session", "db-1", "bootstrap"], {});
  client.setQueryData(["db", "session", "db-2", "bootstrap"], {});
  client.setQueryData(pagesQueryKey("org"), {});
  const applied = new Set<string>();
  const stale = () =>
    client
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey[2] ?? query.queryKey[0]);

  await refreshAfterWorkspaceActions(client, "org", progress("running"), applied);
  assert.deepEqual(stale(), []);
  await refreshAfterWorkspaceActions(client, "org", progress("completed"), applied);
  assert.equal(stale().includes("db-1"), true);
  assert.equal(stale().includes("db-2"), false);
  assert.equal(applied.has("call-1"), true);
  assert.equal(client.getQueryState(pagesQueryKey("org"))?.isInvalidated, true);
});

test("a created database refreshes every database read", async () => {
  const client = new QueryClient();
  client.setQueryData(["db", "session", "db-2", "bootstrap"], {});
  await refreshAfterWorkspaceActions(
    client,
    "org",
    progress("completed", "database.create"),
    new Set(),
  );
  assert.equal(client.getQueryState(["db", "session", "db-2", "bootstrap"])?.isInvalidated, true);
});
