import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";
import { normalizeDatabaseBootstrap, resolveDatabaseBootstrap } from "./cache-references";
import { normalizePageProperties, resolvePageProperties } from "../pages/property-cache";
import { entityPreview, entityUpsertPreview } from "../data/commands";
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

test("page metadata confirmations do not require replacement reads but value, placement and lifecycle changes do", async () => {
  const { session, databases } = fixture();
  try {
    databases.ingestBootstrap("host", bootstrap());
    databases.ingestWindow("host", "source", "q-fixture", window());
    const changed = {
      ...record(),
      updatedAt: stamp(2),
      page: { ...record().page, name: "Renamed", updatedAt: stamp(2) },
    };
    assert.equal(
      databases.isPageMetadataEvent(event({ records: [changed], sourceVersions: { source: 2 } })),
      true,
    );
    assert.equal(
      databases.isPageMetadataEvent(event({ records: [{ ...changed, orderKey: "2000" }] })),
      false,
    );
    assert.equal(
      databases.isPageMetadataEvent(
        event({ records: [{ ...changed, page: { ...changed.page, deletedAt: stamp(2) } }] }),
      ),
      false,
    );
    assert.equal(databases.isPageMetadataEvent(event({ records: [record(2)] })), false);
    assert.equal(
      databases.isPageMetadataEvent(event({ records: [{ ...changed, id: "unknown" }] })),
      false,
    );
    assert.equal(
      databases.isPageMetadataEvent(event({ records: [changed], removedRecordIds: ["other"] })),
      false,
    );
  } finally {
    await session.dispose();
  }
});

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

test("two bindings and a page-property result resolve one partially read definition", async () => {
  const client = new TestQueryClient();
  const owner = sharedClient(client);
  const read = owner.capture();
  try {
    const first = normalizeDatabaseBootstrap(client, read, "host", bootstrap());
    const secondInput = bootstrap("second-host");
    secondInput.dataSources[0]!.id = "second-source";
    secondInput.dataSources[0]!.parentDatabaseId = "second-host";
    secondInput.properties[0]!.id = "second-binding";
    secondInput.properties[0]!.dataSourceId = "second-source";
    secondInput.views[0]!.dataSourceId = "second-source";
    const second = normalizeDatabaseBootstrap(client, read, "second-host", secondInput);
    const { config: _config, ...definition } = bootstrap().properties[0]!.property;
    const page = normalizePageProperties(client, read, "page", {
      workspaceId: "workspace",
      properties: [{ ...definition, name: "Latest definition", updatedAt: stamp(3) }],
      values: [],
    });
    assert.equal("properties" in first, false);
    assert.equal("properties" in page, false);
    for (const reference of [first, second]) {
      assert.equal(
        resolveDatabaseBootstrap(client, reference)!.properties[0]!.property.name,
        "Latest definition",
      );
      assert.deepEqual(
        resolveDatabaseBootstrap(client, reference)!.properties[0]!.property.config,
        { options: [{ label: "Open" }] },
      );
    }
    assert.equal(resolvePageProperties(client, page)!.properties[0]!.name, "Latest definition");
    normalizePageProperties(client, read, "page", {
      workspaceId: "workspace",
      properties: [],
      values: [],
    });
    assert.equal(resolveDatabaseBootstrap(client, first)!.properties.length, 1);
    assert.throws(() =>
      normalizePageProperties(client, read, "page", {
        workspaceId: "workspace",
        properties: [
          { ...definition, name: "Half batch", updatedAt: stamp(4) },
          { ...definition, id: "malformed", updatedAt: "invalid" },
        ],
        values: [],
      }),
    );
    assert.equal(resolvePageProperties(client, page)!.properties[0]!.name, "Latest definition");
  } finally {
    client.clear();
  }
});

test("shared definition previews serialize across bindings and retire coherently on a collaborator confirmation", async () => {
  const { session, databases } = fixture();
  databases.ingestBootstrap("host", bootstrap());
  session.ingest([
    databases.bindings.stage(
      [{ ...bootstrap().properties[0]!, property: undefined, id: "other-binding" }].map(
        ({ property: _property, ...binding }) => binding,
      ),
    ),
  ]);
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const calls: string[] = [];
  const published: string[] = [];
  const release = session.publication.subscribe(() =>
    published.push(
      `${databases.definitions.get("definition")!.name}/${databases.bindings.get("binding")!.width}`,
    ),
  );
  try {
    const pending = session.commands.runMany(
      [
        entityPreview(databases.definitions, "definition", (draft) => {
          draft.name = "Preview";
        }),
        entityPreview(databases.bindings, "binding", (draft) => {
          draft.width = 220;
        }),
      ],
      async () => {
        calls.push("first");
        await first.promise;
      },
    );
    const failed = assert.rejects(pending, /Denied/);
    const queued = session.commands.runMany(
      [
        entityPreview(databases.definitions, "definition", (draft) => {
          draft.name = "Queued";
        }),
        entityPreview(databases.bindings, "other-binding", (draft) => {
          draft.width = 300;
        }),
      ],
      async () => {
        calls.push("second");
        await second.promise;
      },
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.deepEqual(calls, ["first"]);
    assert.deepEqual(published, ["Preview/220"]);
    session.ingest([
      databases.definitions.stage([
        { id: "definition", name: "Collaborator", updatedAt: stamp(3) },
      ]),
    ]);
    assert.equal(databases.definitions.get("definition")!.name, "Collaborator");
    assert.equal(databases.bindings.get("binding")!.width, null);
    first.reject(new Error("Denied"));
    await failed;
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.deepEqual(calls, ["first", "second"]);
    assert.equal(databases.definitions.get("definition")!.name, "Queued");
    second.resolve();
    await queued;
    assert.equal(databases.definitions.get("definition")!.name, "Collaborator");
  } finally {
    release();
    await session.dispose();
  }
});

test("an invalid second preview rolls back the batch before transport or publication", async () => {
  const { session, databases } = fixture();
  databases.ingestBootstrap("host", bootstrap());
  const seen: string[] = [];
  let sent = false;
  const release = session.publication.subscribe(() =>
    seen.push(databases.definitions.get("definition")!.name),
  );
  try {
    await assert.rejects(
      session.commands.runMany(
        [
          entityPreview(databases.definitions, "definition", (draft) => {
            draft.name = "Partial preview";
          }),
          entityPreview(databases.bindings, "missing", (draft) => {
            draft.width = 200;
          }),
        ],
        async () => {
          sent = true;
        },
      ),
    );
    assert.equal(sent, false);
    assert.equal(databases.definitions.get("definition")!.name, "Status");
    assert.ok(seen.every((name) => name === "Status"));
  } finally {
    release();
    await session.dispose();
  }
});

test("a page-only property capability admits its value and rejects another row", async () => {
  const client = new TestQueryClient();
  try {
    const reference = normalizePageProperties(client, sharedClient(client).capture(), "page", {
      workspaceId: "workspace",
      properties: [bootstrap().properties[0]!.property],
      values: [],
      databaseIds: ["host"],
      presenceTargets: [
        {
          databaseId: "host",
          dataSourceId: "source",
          rowId: "record",
          propertyIds: ["definition"],
        },
      ],
    });
    const owner = sharedClient(client).database("host")!;
    assert.equal(owner.databases.hosts.get("host"), undefined);
    const receipt = Promise.withResolvers<void>();
    const pending = owner.session.commands.runMany(
      [
        entityUpsertPreview(
          owner.databases.values,
          {
            id: valueIdentity("page", "definition"),
            valueId: "draft-value",
            pageId: "page",
            propertyId: "definition",
            value: ["Preview"],
            createdAt: stamp(1),
            updatedAt: stamp(1),
          },
          (draft) => {
            draft.value = ["Preview"];
          },
        ),
      ],
      () => receipt.promise,
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.deepEqual(resolvePageProperties(client, reference)!.values[0]!.value, ["Preview"]);
    const frame = event({ records: [record(3)], sourceVersions: { source: 3 } }, 3);
    assert.equal(owner.databases.ingestEvent(frame), "published");
    assert.deepEqual(resolvePageProperties(client, reference)!.values[0]!.value, ["Value 3"]);
    assert.equal(resolvePageProperties(client, reference)!.values[0]!.id, "persisted-value");
    assert.equal(
      owner.databases.ingestEvent(
        event(
          {
            records: [
              {
                ...record(4),
                id: "other",
                pageId: "private",
                page: { ...record(4).page, id: "private" },
                valuesByPropertyId: {},
              },
            ],
            sourceVersions: { source: 4 },
          },
          4,
        ),
      ),
      "authorized-read-required",
    );
    assert.equal(owner.pages.get("private"), undefined);
    owner.databases.ingestEvent(event({ records: [record(2)], sourceVersions: { source: 2 } }, 2));
    receipt.resolve();
    await pending;
    assert.deepEqual(resolvePageProperties(client, reference)!.values[0]!.value, ["Value 3"]);
  } finally {
    client.clear();
  }
});

test("dependency refresh fields describe changed content and suppress duplicate confirmations", async () => {
  const { session, databases } = fixture();
  try {
    databases.ingestBootstrap("host", bootstrap());
    databases.ingestWindow("host", "source", "q-fixture", window());
    const changed = record(3);
    changed.page.name = record(1).page.name;
    const frame = event({ records: [changed], sourceVersions: { source: 3 } }, 3);
    assert.deepEqual(databases.contentChanges(frame), {
      pageIds: [],
      propertyIds: ["definition", "binding"],
    });
    databases.ingestEvent(frame);
    assert.deepEqual(databases.contentChanges(frame), { pageIds: [], propertyIds: [] });
  } finally {
    await session.dispose();
  }
});
