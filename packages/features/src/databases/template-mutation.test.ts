import assert from "node:assert/strict";
import test from "node:test";
import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import { useApplyDatabaseTemplate } from "./mutation-hooks";
import { databaseQueryKey } from "./queries";
import { pagesNavRootQueryKey } from "../pages/queries";
import { createTestDatabasePayload } from "./test-helpers";

test("template application refreshes collections and navigation without payload caching", async () => {
  const original = createTestDatabasePayload();
  original.database.accessLevel = "edit";
  const result = createTestDatabasePayload();
  result.database.isFavorite = false;
  const { mutation, queryClient } = createMutationTestRuntime(useApplyDatabaseTemplate, async <T>(url: string) => {
    assert.equal(url, "/databases/data-source-1/apply-template");
    return result as T;
  });
  const navKey = pagesNavRootQueryKey("org-1");
  queryClient.setQueryData(databaseQueryKey("database-1"), original);
  queryClient.setQueryData(navKey, { pages: [], databases: [], placements: [] });
  try {
    const updated = await mutation.mutateAsync({ databaseId: "data-source-1", config: {}, name: "Projects", properties: [], rows: [] });
    assert.equal(updated.database.accessLevel, undefined);
    assert.equal(queryClient.getQueryState(navKey)?.isInvalidated, true);
    assert.deepEqual(queryClient.getQueryData(databaseQueryKey("database-1")), original);
  } finally { queryClient.clear(); }
});
