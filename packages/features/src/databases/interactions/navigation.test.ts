import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient as QueryClient } from "../../data/testing";
import type { PageNavigationPayload } from "../../pages/contracts";
import type { DatabaseIntention } from "./model";
import { projectDatabaseNavigation, preferNewestDatabaseNavigation } from "./navigation";
import { DatabaseController } from "./store";
import type { ApiFetcher } from "../../shared/api-fetcher";

function navigation(version = 1, sourceVersion = 1): PageNavigationPayload {
  const timestamp = "2026-09-29T00:00:00.000Z";
  return {
    pages: [],
    placements: [],
    databases: [
      {
        id: "host",
        workspaceId: "workspace",
        pageId: null,
        name: "Saved",
        config: {},
        dataSourceConfig: { icon: "old" },
        createdAt: timestamp,
        updatedAt: timestamp,
        metadataState: { version, primarySource: { id: "source", version: sourceVersion } },
        actorState: { actorId: "actor", revision: 1, isFavorite: false },
        views: ["table", "kanban"].map((id, position) => ({
          id,
          position,
          name: id,
          type: id,
          config: {},
          databaseId: "host",
          dataSourceId: "source",
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      },
    ],
  };
}

test("navigation projects the same metadata intentions without rewriting snapshots or clocks", () => {
  const raw = navigation();
  const intention: DatabaseIntention = {
    id: "command",
    status: "queued",
    effects: [],
    metadataEffects: [
      { hostId: "host", id: "host", kind: "database", patch: { name: "Pending" } },
      {
        hostId: "host",
        id: "table",
        kind: "view",
        patch: { name: "Tasks" },
        placement: { afterId: "kanban", beforeId: null },
        configuration: [{ operation: "set", path: ["icon"], value: "new" }],
      },
      {
        hostId: "different-host",
        dataSourceId: "source",
        id: "source",
        kind: "source",
        configuration: [{ operation: "set", path: ["icon"], value: "shared" }],
      },
    ],
  };
  const projected = projectDatabaseNavigation(raw, [intention]);
  assert.equal(projected.databases[0]!.name, "Pending");
  assert.deepEqual(
    projected.databases[0]!.views.map(({ id }) => id),
    ["kanban", "table"],
  );
  assert.deepEqual(projected.databases[0]!.dataSourceConfig, { icon: "shared" });
  assert.equal(raw.databases[0]!.name, "Saved");
  assert.equal(projected.databases[0]!.metadataState, raw.databases[0]!.metadataState);
  assert.equal(
    projectDatabaseNavigation(raw, [
      { ...intention, hostVersions: { host: 1 }, sourceVersions: { source: 1 } },
    ]),
    raw,
  );
});

test("navigation read reconciliation independently retains host/source/actor clocks", () => {
  const cached = navigation(3, 4);
  cached.databases[0]!.name = "New host";
  cached.databases[0]!.dataSourceConfig = { icon: "New source" };
  const incoming = navigation(2, 5);
  incoming.databases[0]!.dataSourceConfig = { icon: "Newest source" };
  incoming.databases[0]!.actorState = { actorId: "actor", revision: 2, isFavorite: true };
  const result = preferNewestDatabaseNavigation(incoming, cached).databases[0]!;
  assert.equal(result.name, "New host");
  assert.deepEqual(result.dataSourceConfig, { icon: "Newest source" });
  assert.equal(result.metadataState?.version, 3);
  assert.equal(result.metadataState?.primarySource?.version, 5);
  assert.equal(result.isFavorite, undefined); // Incoming favorite fields are not fabricated.
  const freshHost = navigation(4, 2);
  assert.deepEqual(
    preferNewestDatabaseNavigation(freshHost, cached).databases[0]!.dataSourceConfig,
    { icon: "New source" },
  );
  assert.deepEqual(
    preferNewestDatabaseNavigation({ ...incoming, databases: [] }, cached).databases,
    [],
  );
});

test("sidebar-only metadata commands stay projected until every mounted navigation confirms", async () => {
  const client = new QueryClient();
  let confirm!: (value: unknown) => void;
  let commandId = "";
  const fetch = ((_: string, init?: RequestInit) => {
    commandId = JSON.parse(String(init?.body)).commandId;
    return new Promise<unknown>((resolve) => {
      confirm = resolve;
    });
  }) as ApiFetcher;
  const controller = new DatabaseController(client, "session", fetch);
  const first = {},
    second = {};
  const raw = navigation();
  controller.observeNavigation(first, raw);
  controller.observeNavigation(second, raw);
  try {
    const saved = controller.execute({
      databaseId: "host",
      command: { type: "database.update", patch: { name: "Pending" } },
    });
    assert.equal(
      projectDatabaseNavigation(raw, controller.getSnapshot()).databases[0]!.name,
      "Pending",
    );
    confirm({
      commandId,
      sourceVersions: {},
      result: {},
      event: {
        actorId: "actor",
        areas: ["databases"],
        changes: {},
        commandId,
        committedAt: "2026-09-29T00:00:00.000Z",
        databaseId: "host",
        dataSourceId: null,
        eventId: commandId,
        protocolVersion: 2,
        type: "database.mutation",
        version: 2,
      },
    });
    await saved;
    controller.observeNavigation(first, navigation(2));
    assert.equal(controller.getSnapshot().length, 1);
    controller.observeNavigation(second, navigation(2));
    assert.equal(controller.getSnapshot().length, 0);
  } finally {
    controller.dispose();
    client.clear();
  }
});
