import { TestQueryClient as QueryClient } from "../../data/testing";
import assert from "node:assert/strict";
import test from "node:test";

import type { ApiFetcher } from "../../shared/api-fetcher";
import {
  databaseContextExportQueryOptions,
  databaseContextExportRootQueryKey,
} from "../queries/queries";

test("database context exports use an isolated complete-read query", async () => {
  const calls: Array<{ path: string; method?: string }> = [];
  const apiFetch: ApiFetcher = async (path, options) => {
    calls.push({ path, method: options?.method });
    return {
      database: {
        id: "database/1",
        workspaceId: "workspace",
        name: "Host",
        pageId: null,
        config: {},
        deletedAt: null,
        version: 1,
        createdAt: "2026-10-05T00:00:00.001Z",
        updatedAt: "2026-10-05T00:00:00.001Z",
      },
      activeDataSource: null,
      dataSources: [],
      properties: [],
      views: [],
      rows: [],
      values: [],
    } as never;
  };
  const queryClient = new QueryClient();

  await queryClient.fetchQuery(
    databaseContextExportQueryOptions(apiFetch, "database/1", "source/1"),
  );

  assert.deepEqual(calls, [
    {
      method: "GET",
      path: "/databases/database%2F1/export?dataSourceId=source%2F1",
    },
  ]);
  assert.deepEqual(databaseContextExportRootQueryKey("database/1"), [
    "database-context-export",
    "database/1",
  ]);
  queryClient.clear();
});
