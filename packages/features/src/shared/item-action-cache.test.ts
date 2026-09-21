import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import {
  databaseBootstrapQueryKey,
  databaseWindowQueryKey,
} from "../databases/queries/keys";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
} from "./item-action-cache";

test("deleting a database refreshes trash-aware reads and evicts active-only reads", async () => {
  const queryClient = new QueryClient();
  const activeBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
  });
  const deletedBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
    includeDeleted: true,
  });

  try {
    queryClient.setQueryData(activeBootstrap, { cached: true });
    queryClient.setQueryData(deletedBootstrap, { cached: true });

    await invalidateDeletedItems({
      queryClient,
      result: {
        deletedDatabaseIds: ["database-1"],
        deletedPageIds: [],
      },
      workspaceId: "workspace-1",
    });

    assert.equal(queryClient.getQueryState(activeBootstrap), undefined);
    assert.equal(queryClient.getQueryState(deletedBootstrap)?.isInvalidated, true);
  } finally {
    queryClient.clear();
  }
});

test("restoring a database invalidates active and trash-aware database reads", async () => {
  const queryClient = new QueryClient();
  const activeBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
  });
  const deletedBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-1",
    includeDeleted: true,
  });
  const deletedWindow = databaseWindowQueryKey("session-1", {
    databaseId: "database-1",
    dataSourceId: "source-1",
    includeDeleted: true,
    queryHash: "query-1",
  });
  const otherBootstrap = databaseBootstrapQueryKey("session-1", {
    databaseId: "database-2",
  });

  try {
    for (const key of [
      activeBootstrap,
      deletedBootstrap,
      deletedWindow,
      otherBootstrap,
    ]) {
      queryClient.setQueryData(key, { cached: true });
    }

    await invalidateRestoredItems({
      queryClient,
      result: {
        restoredDatabaseIds: ["database-1"],
        restoredPageIds: [],
      },
      workspaceId: "workspace-1",
    });

    assert.equal(queryClient.getQueryState(activeBootstrap)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(deletedBootstrap)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(deletedWindow)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(otherBootstrap)?.isInvalidated, false);
  } finally {
    queryClient.clear();
  }
});
