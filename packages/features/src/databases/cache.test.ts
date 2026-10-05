import assert from "node:assert/strict";
import { test } from "node:test";
import { DataSession } from "../data/session";
import { createPageCollection } from "../pages/cache";
import { DatabaseCollections } from "./cache";
import type {
  DatabaseBootstrapResponse,
  DatabaseMutationChanges,
  DatabaseMutationEventV2,
  DatabaseRecordEntity,
} from "./core/entities";
import { sourceLinkIdentity, valueIdentity } from "./schema/cache-entities";

const stamp = (n: number) => `2026-10-05T00:00:00.${String(n).padStart(3, "0")}Z`;
function bootstrap(host = "host", position = 0): DatabaseBootstrapResponse {
  return {
    database: {
      id: host,
      workspaceId: "workspace",
      name: "Host",
      config: {},
      accessLevel: "edit",
      pageId: null,
      deletedAt: null,
      createdAt: stamp(1),
      updatedAt: stamp(1),
      version: 1,
    },
    dataSources: [
      {
        id: "source",
        workspaceId: "workspace",
        parentDatabaseId: "host",
        name: "Source",
        config: {},
        configVersion: 0,
        version: 1,
        position,
        linkedAt: stamp(1),
        createdAt: stamp(1),
        updatedAt: stamp(1),
      },
    ],
    properties: [
      {
        id: "binding",
        propertyId: "definition",
        dataSourceId: "source",
        position: 0,
        visible: true,
        width: null,
        createdAt: stamp(1),
        updatedAt: stamp(1),
        property: {
          id: "definition",
          workspaceId: "workspace",
          name: "Status",
          type: "select",
          config: { options: [{ label: "Open" }] },
          createdAt: stamp(1),
          updatedAt: stamp(1),
        },
      },
    ],
    views: [
      {
        id: `view-${host}`,
        databaseId: host,
        dataSourceId: "source",
        name: "Table",
        type: "table",
        config: {},
        position: 0,
        createdAt: stamp(1),
        updatedAt: stamp(1),
      },
    ],
  };
}
function record(revision = 1): DatabaseRecordEntity {
  return {
    id: "record",
    dataSourceId: "source",
    pageId: "page",
    parentRowId: null,
    orderKey: "1000",
    createdAt: stamp(1),
    updatedAt: stamp(revision),
    page: {
      id: "page",
      name: `Page ${revision}`,
      metadata: { cover: "cover" },
      hasContent: false,
      deletedAt: null,
      createdAt: stamp(1),
      updatedAt: stamp(revision),
    },
    valuesByPropertyId: {
      definition: {
        id: "persisted-value",
        pageId: "page",
        propertyId: "definition",
        value: [`Value ${revision}`],
        createdAt: stamp(1),
        updatedAt: stamp(revision),
      },
    },
  };
}
function window(revision = 1, records = [record(revision)]) {
  return {
    records,
    queryHash: "q-fixture",
    totalCount: 21,
    hasMore: true,
    offset: 0,
    snapshot: "server-snapshot",
    databaseVersion: revision,
    dataSourceVersion: revision,
  };
}
function event(changes: DatabaseMutationChanges, version = 2): DatabaseMutationEventV2 {
  return {
    changes,
    version,
    dataSourceId: "source",
    databaseId: "host",
    actorId: "actor",
    commandId: "command",
    eventId: `event-${version}`,
    areas: ["records"],
    protocolVersion: 2,
    type: "database.mutation",
    committedAt: stamp(version),
  };
}
function fixture() {
  const session = new DataSession({
    deployment: "fixture",
    workspaceId: "workspace",
    viewer: { kind: "account", accountId: "account", actorId: "actor", sessionId: "auth" },
  });
  const pages = createPageCollection(session);
  const databases = new DatabaseCollections(session, pages);
  return { session, pages, databases };
}

test("bootstrap and windows return server result references and normalize storage identities", async () => {
  const { session, pages, databases } = fixture();
  const boot = databases.ingestBootstrap("host", bootstrap());
  assert.deepEqual(boot.bindingIds, ["binding"]);
  assert(!("config" in boot));
  assert.equal(databases.bindings.get("binding")!.propertyId, "definition");
  assert.deepEqual(databases.definitions.get("definition")!.config, {
    options: [{ label: "Open" }],
  });
  const result = databases.ingestWindow("host", "source", "q-fixture", window());
  assert(!("records" in result));
  assert.equal(result.totalCount, 21);
  assert.equal(result.snapshot, "server-snapshot");
  assert.deepEqual(result.recordIds, ["record"]);
  assert.equal(pages.get("page")!.name, "Page 1");
  assert.equal(
    databases.values.get(valueIdentity("page", "definition"))!.valueId,
    "persisted-value",
  );
  databases.ingestWindow("host", "source", "q-fixture", window(1, []));
  assert.equal(databases.records.collection.size, 1);
  assert.equal(pages.collection.size, 1);
  await session.dispose();
});

test("unlinking a host preserves the source, another link and shared entities", async () => {
  const { session, databases } = fixture();
  databases.ingestBootstrap("host", bootstrap());
  databases.ingestBootstrap("other-host", bootstrap("other-host", 4));
  assert.equal(databases.links.get(sourceLinkIdentity("other-host", "source"))!.position, 4);
  assert.equal(
    databases.ingestEvent(
      event({ removedDataSourceIds: ["source"], sourceVersions: { source: 1 } }),
    ),
    "published",
  );
  assert.equal(databases.links.get(sourceLinkIdentity("host", "source")), undefined);
  assert(databases.links.get(sourceLinkIdentity("other-host", "source")));
  assert(databases.sources.get("source"));
  databases.ingestBootstrap("host", bootstrap());
  assert.equal(
    databases.links.get(sourceLinkIdentity("host", "source")),
    undefined,
    "delayed bootstrap must not resurrect a link",
  );
  assert.throws(
    () => databases.ingestWindow("host", "source", "q-fixture", window()),
    /authorized source/,
  );
  await session.dispose();
});

test("socket/ack entities converge with a delayed window without extra reads", async () => {
  const { session, pages, databases } = fixture();
  databases.ingestBootstrap("host", bootstrap());
  databases.ingestWindow("host", "source", "q-fixture", window());
  const newest = event({ records: [record(3)], sourceVersions: { source: 3 } }, 3);
  databases.ingestEvent(newest);
  databases.ingestEvent(newest);
  databases.ingestWindow("host", "source", "q-fixture", window(2));
  assert.equal(pages.get("page")!.name, "Page 3");
  assert.deepEqual(databases.values.get(valueIdentity("page", "definition"))!.value, ["Value 3"]);
  assert.equal(databases.sources.get("source")!.version, 3);
  assert.equal(databases.hosts.get("host")!.version, 3);
  await session.dispose();
});

test("unknown socket sources require an authorized read and publish nothing", async () => {
  const { session, databases } = fixture();
  databases.ingestBootstrap("host", bootstrap());
  const unknown = record();
  unknown.dataSourceId = "unknown";
  assert.equal(
    databases.ingestEvent(event({ records: [unknown], sourceVersions: { unknown: 1 } })),
    "authorized-read-required",
  );
  assert.equal(databases.records.collection.size, 0);
  assert.equal(databases.hosts.get("host")!.version, 1);
  await session.dispose();
});

test("malformed identities and query hashes cannot partially publish", async () => {
  const { session, databases } = fixture();
  databases.ingestBootstrap("host", bootstrap());
  const invalid = bootstrap();
  invalid.database.name = "Must not publish";
  invalid.properties[0]!.propertyId = "wrong";
  assert.throws(() => databases.ingestBootstrap("host", invalid), /identity mismatch/);
  assert.equal(databases.hosts.get("host")!.name, "Host");
  assert.throws(
    () => databases.ingestWindow("host", "source", "different-query", window()),
    /query hash/,
  );
  const badRecord = record();
  badRecord.valuesByPropertyId.definition!.pageId = "other-page";
  assert.throws(
    () => databases.ingestWindow("host", "source", "q-fixture", window(1, [badRecord])),
    /identity mismatch/,
  );
  assert.equal(databases.records.collection.size, 0);
  await session.dispose();
});

test("archived definition confirmations preserve bindings and record exclusion preserves pages", async () => {
  const { session, pages, databases } = fixture();
  databases.ingestBootstrap("host", bootstrap());
  databases.ingestWindow("host", "source", "q-fixture", window());
  const binding = bootstrap().properties[0]!;
  binding.property.deletedAt = stamp(2);
  binding.property.updatedAt = stamp(2);
  databases.ingestEvent(
    event({
      properties: [binding],
      removedPropertyIds: ["binding"],
      removedRecordIds: ["record"],
      sourceVersions: { source: 2 },
    }),
  );
  assert.equal(databases.definitions.get("definition")!.deletedAt, stamp(2));
  assert(databases.bindings.get("binding"));
  assert(pages.get("page"));
  assert(databases.records.get("record"));
  await session.dispose();
});
