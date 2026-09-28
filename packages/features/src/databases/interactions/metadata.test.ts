import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseBootstrapResponse } from "../core/entities";
import { projectDatabaseMetadata, type MetadataIntention } from "./metadata";

export function metadataSnapshot(hostId = "host"): DatabaseBootstrapResponse {
  const time = "2026-09-28T00:00:00.000Z";
  return {
    database: {
      id: hostId,
      name: "Original",
      config: {},
      version: 1,
      pageId: null,
      accessLevel: "full",
      deletedAt: null,
      workspaceId: "workspace",
      createdAt: time,
      updatedAt: time,
    },
    dataSources: [
      {
        id: "source",
        name: "Source",
        config: {},
        version: 1,
        configVersion: 1,
        parentDatabaseId: "host",
        position: 0,
        linkedAt: null,
        workspaceId: "workspace",
        createdAt: time,
        updatedAt: time,
      },
    ],
    properties: [],
    views: [
      {
        id: "view",
        databaseId: hostId,
        dataSourceId: "source",
        name: "Table",
        type: "table",
        position: 0,
        config: { filters: ["old"], sorts: ["name"] },
        createdAt: time,
        updatedAt: time,
      },
    ],
  };
}

test("metadata intentions compose without mutating server snapshots or rolling back another field", () => {
  const snapshot = metadataSnapshot();
  const first: MetadataIntention = {
    metadataEffects: [
      {
        hostId: "host",
        kind: "view",
        id: "view",
        configuration: [{ operation: "set", path: ["filters"], value: ["new"] }],
      },
    ],
  };
  const second: MetadataIntention = {
    metadataEffects: [
      {
        hostId: "host",
        kind: "view",
        id: "view",
        configuration: [{ operation: "remove", path: ["sorts"] }],
      },
    ],
  };
  assert.deepEqual(projectDatabaseMetadata(snapshot, [first, second]).views[0]!.config, {
    filters: ["new"],
  });
  assert.deepEqual(projectDatabaseMetadata(snapshot, [second]).views[0]!.config, {
    filters: ["old"],
  });
  assert.deepEqual(snapshot.views[0]!.config, { filters: ["old"], sorts: ["name"] });
});

test("linked hosts retire source effects by their own source revision, not another host clock", () => {
  const snapshot = metadataSnapshot("sibling");
  snapshot.database.version = 100;
  const intention: MetadataIntention = {
    sourceVersions: { source: 2 },
    metadataEffects: [
      {
        hostId: "host",
        dataSourceId: "source",
        kind: "source",
        id: "source",
        patch: { name: "Updated" },
      },
    ],
  };
  assert.equal(projectDatabaseMetadata(snapshot, [intention]).dataSources[0]!.name, "Updated");
  snapshot.dataSources[0]!.version = 2;
  assert.equal(projectDatabaseMetadata(snapshot, [intention]), snapshot);
});
