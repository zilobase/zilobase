import { normalizeNavigationReference } from "../../pages/navigation-references";
import { resolveNavigationReference } from "../../pages/cache";
import { sharedClient } from "../../data/client";
import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient as QueryClient } from "../../data/testing";
import type { PageNavigationPayload } from "../../pages/contracts";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { DatabaseController } from "./store";
import { DatabaseCommandUnconfirmedError } from "../mutations/execute";
import { pagesQueryKey, pagesQueryOptions } from "../../pages/queries";
import { preferNewestDatabaseActorState, projectDatabaseFavorites } from "./favorites";

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

test("favorite previews compose outside snapshots and only their own actor clock retires them", () => {
  const raw = navigation();
  const first = {
    favorite: { hostId: "host", value: true, confirmation: { actorId: "actor", revision: 1 } },
  };
  const second = { favorite: { hostId: "host", value: false } };
  assert.equal(projectDatabaseFavorites(raw, [first]).databases[0]!.isFavorite, true);
  assert.equal(projectDatabaseFavorites(raw, [first, second]).databases[0]!.isFavorite, false);
  assert.equal(raw.databases[0]!.isFavorite, false);
  const confirmed = navigation(1, true);
  assert.equal(projectDatabaseFavorites(confirmed, [first]), confirmed);
  assert.equal(
    projectDatabaseFavorites(navigation(100, false, "other"), [first]).databases[0]!.isFavorite,
    true,
  );
});

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
    assert.equal(
      preferNewestDatabaseActorState(navigation(0, false, "other"), cached).databases[0]!
        .isFavorite,
      false,
    );
  } finally {
    client.clear();
  }
});

test("favorite recovery retains its preview until each navigation consumer confirms the actor revision", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const requests: Array<{
    body: string;
    resolve: (ack: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  const fetch = ((_: string, init?: RequestInit) =>
    new Promise<unknown>((resolve, reject) =>
      requests.push({ body: String(init?.body), resolve, reject }),
    )) as ApiFetcher;
  const controller = new DatabaseController(client, "session", fetch);
  const other = new DatabaseController(client, "other-session", fetch);
  const first = {},
    second = {};
  const raw = navigation();
  const key = pagesQueryKey("workspace");
  client.setQueryData(key, raw);
  controller.observeNavigation(first, raw);
  controller.observeNavigation(second, raw);
  try {
    const save = controller.execute({
      databaseId: "host",
      command: { type: "database.favorite", favorite: true },
    });
    const rejected = assert.rejects(save, DatabaseCommandUnconfirmedError);
    assert.equal(
      projectDatabaseFavorites(raw, controller.getSnapshot()).databases[0]!.isFavorite,
      true,
    );
    assert.equal(
      projectDatabaseFavorites(raw, other.getSnapshot()).databases[0]!.isFavorite,
      false,
    );
    assert.equal(client.getQueryData<PageNavigationPayload>(key)?.databases[0]!.isFavorite, false);
    requests[0]!.reject(new TypeError("network"));
    await tick();
    requests[1]!.reject(new TypeError("network"));
    await rejected;
    controller.retryUnconfirmed();
    assert.equal(requests[2]!.body, requests[0]!.body);
    const { commandId } = JSON.parse(requests[2]!.body);
    requests[2]!.resolve({
      commandId,
      event: null,
      sourceVersions: {},
      result: {},
      privateConfirmation: { actorId: "actor", databaseId: "host", revision: 1 },
    });
    await tick();
    assert.equal(controller.getSnapshot().length, 1);
    const fresh = navigation(1, true);
    client.setQueryData(key, fresh);
    controller.observeNavigation(first, fresh);
    assert.equal(controller.getSnapshot().length, 1);
    controller.observeNavigation(second, fresh);
    assert.equal(controller.getSnapshot().length, 0);
    assert.equal(
      client.getQueryData<PageNavigationPayload>(key)?.databases[0]!.actorState?.revision,
      1,
    );
  } finally {
    controller.dispose();
    other.dispose();
    client.clear();
  }
});
