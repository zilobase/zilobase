import { normalizeNavigationReference } from "../../pages/navigation-references";
import { resolveNavigationReference } from "../../pages/cache";
import { sharedClient } from "../../data/client";
import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient as QueryClient } from "../../data/testing";
import type { PageNavigationPayload } from "../../pages/contracts";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { pagesQueryKey, pagesQueryOptions } from "../../pages/queries";

function navigation(revision = 0, isFavorite = false, actorId = "actor"): PageNavigationPayload {
  return {
    pages: [],
    placements: [],
    databases: [
      {
        id: "host",
        workspaceId: "workspace",
        pageId: null,
        name: "Database",
        config: {},
        metadataState: { version: 1, primarySource: null },
        dataSources: [],
        views: [],
        createdAt: "2026-09-29T00:00:00.000Z",
        updatedAt: "2026-09-29T00:00:00.000Z",
        isFavorite,
        actorState: { actorId, revision, isFavorite },
      },
    ],
  };
}
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test("stale navigation GETs retain newer private state without retaining stale public metadata", async () => {
  const client = new QueryClient();
  const key = pagesQueryKey("workspace");
  const cached = navigation(2, true);
  client.setQueryData(
    key,
    normalizeNavigationReference(client, sharedClient(client).capture(), "workspace", cached),
  );
  const incoming = navigation(1, false);
  incoming.databases[0]!.name = "New name";
  try {
    const reference = await client.fetchQuery(
      pagesQueryOptions((async () => incoming) as ApiFetcher, "workspace"),
    );
    const result = resolveNavigationReference(client, reference);
    assert.equal(result.databases[0]!.isFavorite, true);
    assert.equal(result.databases[0]!.name, "New name");
    assert.equal(result.databases[0]!.actorState?.revision, 2);
  } finally {
    client.clear();
  }
});
