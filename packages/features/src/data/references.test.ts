import { databaseHostEntitySchema } from "../databases/core/entities";
import { pagesQueryKey } from "../pages/queries";
import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient } from "./testing";
import { sharedClient } from "./client";
import { normalizeNavigationReference } from "../pages/navigation-references";
import {
  resolveNavigationReference,
  stageAuthorizedPages,
  resolvePageReference,
} from "../pages/cache";
import { normalizeSearchReferences, resolveSearchReferences } from "../search/references";
import { normalizeAiPageReferences, resolveAiPageReferences } from "../pages/summary-references";
import {
  normalizeDatabaseExportReference,
  resolveDatabaseExportReference,
} from "../databases/export-references";
import { DatabaseController } from "../databases/interactions/store";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { DatabaseExportPayload } from "../databases/core/export-payload";
import { normalizeAccessReferences, resolvePageAccessReferences } from "../pages/access-references";

const stamp = (n: number) => `2026-10-05T00:00:00.${String(n).padStart(3, "0")}Z`;
const host = {
  id: "host",
  workspaceId: "workspace",
  pageId: null,
  name: "Host",
  createdById: "actor",
  deletedById: null,
  teamspaceId: null,
  config: {},
  deletedAt: null,
  createdAt: stamp(1),
  updatedAt: stamp(1),
  version: 1,
};
const source = {
  id: "source",
  workspaceId: "workspace",
  parentDatabaseId: "host",
  name: "Source",
  config: {},
  configVersion: 0,
  version: 1,
  position: 0,
  linkedAt: stamp(1),
  createdAt: stamp(1),
  updatedAt: stamp(1),
};
const page = {
  id: "page",
  workspaceId: "workspace",
  name: "Original",
  type: "pageblock",
  url: "#",
  hasContent: false,
  metadata: { emoji: "📚", zilobaseai: "skill" as const },
  createdAt: stamp(1),
  updatedAt: stamp(1),
  deletedAt: null,
};
const definition = {
  id: "definition",
  workspaceId: "workspace",
  name: "Status",
  type: "text",
  config: {},
  createdAt: stamp(1),
  updatedAt: stamp(1),
};
const binding = {
  id: "binding",
  dataSourceId: "source",
  propertyId: "definition",
  position: 0,
  visible: true,
  width: null,
  createdAt: stamp(1),
  updatedAt: stamp(1),
  property: definition,
};
const exported: DatabaseExportPayload = {
  database: host,
  dataSources: [source],
  activeDataSource: source,
  properties: [binding],
  views: [],
  rows: [
    {
      id: "record",
      dataSourceId: "source",
      pageId: "page",
      page,
      orderKey: "42.5",
      parentRowId: null,
      position: 0,
      createdAt: stamp(1),
      updatedAt: stamp(1),
    },
  ],
  values: [
    {
      id: "value",
      pageId: "page",
      propertyId: "definition",
      value: "Original",
      createdAt: stamp(1),
      updatedAt: stamp(1),
    },
  ],
};
const nav = {
  pages: [page],
  placements: [],
  databases: [
    {
      ...host,
      views: [],
      dataSources: [source],
      metadataState: { version: 1, primarySource: { id: "source", version: 1 } },
      actorState: { actorId: "actor", revision: 0, isFavorite: false },
    },
  ],
};

test("navigation, search, AI summaries and complete exports join current entities without retaining their labels", () => {
  const client = new TestQueryClient();
  const cache = sharedClient(client);
  try {
    const navigation = normalizeNavigationReference(client, cache.capture(), "workspace", {
      ...nav,
      placements: [
        {
          id: "placement",
          workspaceId: "workspace",
          parentKind: "database",
          parentId: "host",
          itemKind: "page",
          itemId: "page",
          placementKind: "database_row",
          position: 0,
          createdAt: stamp(1),
          updatedAt: stamp(1),
        } as never,
      ],
    });
    const search = normalizeSearchReferences(client, cache.capture(), "workspace", [
      {
        id: "page",
        title: "Index title",
        emoji: "📚",
        type: "page",
        path: "/page",
        excerpt: "Ranked snippet",
        entity: page,
      },
    ]);
    const ai = normalizeAiPageReferences(client, cache.capture(), "workspace", [
      {
        id: page.id,
        name: page.name,
        workspaceId: page.workspaceId,
        updatedAt: page.updatedAt,
        url: page.url,
        metadata: page.metadata,
      },
    ]);
    const context = normalizeDatabaseExportReference(client, cache.capture(), "host", exported);
    const owner = cache.get(context.bootstrap.cacheId)!;
    const { workspaceId: _workspace, type: _type, url: _url, ...recordPage } = page;
    owner.databases.ingestEvent({
      type: "database.mutation",
      protocolVersion: 2,
      actorId: "other",
      commandId: "command",
      databaseId: "host",
      dataSourceId: "source",
      version: 2,
      committedAt: stamp(2),
      eventId: "event",
      areas: ["records"],
      changes: {
        sourceVersions: { source: 2 },
        records: [
          {
            id: "record",
            dataSourceId: "source",
            pageId: "page",
            parentRowId: null,
            orderKey: "42.5",
            createdAt: stamp(1),
            updatedAt: stamp(2),
            page: { ...recordPage, name: "Current", updatedAt: stamp(2) },
            valuesByPropertyId: {
              definition: { ...exported.values[0]!, value: "Current", updatedAt: stamp(2) },
            },
          },
        ],
      },
    });
    assert.equal(resolveNavigationReference(client, navigation).pages[0]!.name, "Current");
    assert.equal(resolveSearchReferences(client, search)[0]!.title, "Current");
    assert.equal(resolveAiPageReferences(client, ai)[0]!.name, "Current");
    const snapshot = resolveDatabaseExportReference(client, context)!;
    assert.equal(snapshot.rows[0]!.page.name, "Current");
    assert.equal(snapshot.values[0]!.value, "Current");
    assert.equal(snapshot.rows[0]!.orderKey, "42.5");
    assert.equal("name" in context.rows[0]!.context, false);
    assert.equal("title" in search[0]!, false);
    assert.equal(search[0]!.excerpt, "Ranked snippet");
    normalizeDatabaseExportReference(client, cache.capture(), "host", exported);
    assert.equal(resolveDatabaseExportReference(client, context)!.values[0]!.value, "Current");
    assert.throws(
      () =>
        normalizeNavigationReference(client, cache.capture(), "workspace", {
          ...nav,
          pages: [{ ...page, name: "Invalid batch", updatedAt: stamp(3) }],
          placements: [
            {
              id: "placement",
              workspaceId: "other",
              parentId: "page",
              parentKind: "page",
              itemKind: "page",
              itemId: "page",
              placementKind: "linked",
              position: 0,
            },
          ],
        }),
      /scope mismatch/,
    );
    assert.equal(owner.pages.get("page")!.name, "Current");
    owner.session.batch(() =>
      assert.throws(
        () => resolveDatabaseExportReference(client, context),
        /publication is in progress/,
      ),
    );
  } finally {
    client.clear();
  }
});

test("delayed preference and access reads cannot overwrite later authorized reads", () => {
  const client = new TestQueryClient();
  const cache = sharedClient(client);
  try {
    const delayed = cache.capture();
    const ref = stageAuthorizedPages(client, cache.capture(), "workspace", [
      { ...page, isFavorite: true },
    ])[0]!;
    stageAuthorizedPages(client, delayed, "workspace", [{ ...page, isFavorite: false }]);
    assert.equal(resolvePageReference(client, ref)!.isFavorite, true);
    const rule = {
      id: "rule",
      workspaceId: "workspace",
      pageId: "page",
      targetType: "user" as const,
      targetId: "other",
      accessLevel: "view" as const,
      createdAt: stamp(1),
      updatedAt: stamp(1),
    };
    const newer = normalizeAccessReferences(client, cache.capture(), "page", "page", [
      { ...rule, accessLevel: "edit" },
    ]);
    normalizeAccessReferences(client, delayed, "page", "page", [rule]);
    assert.equal(resolvePageAccessReferences(client, newer).access[0]!.accessLevel, "edit");
  } finally {
    client.clear();
  }
});

test("sidebar-only favorites publish actor confirmation from one write without a navigation read", async () => {
  const client = new TestQueryClient();
  const cache = sharedClient(client);
  const navigation = normalizeNavigationReference(client, cache.capture(), "workspace", nav);
  const requests: string[] = [];
  const controller = new DatabaseController(client, "session", (async (path, init) => {
    requests.push(`${init?.method} ${path}`);
    const { commandId } = JSON.parse(String(init?.body));
    return {
      commandId,
      event: null,
      sourceVersions: {},
      result: {},
      privateConfirmation: { actorId: "actor", databaseId: "host", revision: 1 },
    };
  }) as ApiFetcher);
  try {
    await controller.execute({
      databaseId: "host",
      command: { type: "database.favorite", favorite: true },
    });
    assert.equal(resolveNavigationReference(client, navigation).databases[0]!.isFavorite, true);
    assert.equal(requests.length, 1);
    normalizeNavigationReference(client, cache.capture(), "workspace", nav);
    assert.equal(resolveNavigationReference(client, navigation).databases[0]!.isFavorite, true);
  } finally {
    controller.dispose();
    client.clear();
  }
});

test("sidebar-only host edits use the shared preview and confirmation without bootstrap reads", async () => {
  const client = new TestQueryClient();
  const cache = sharedClient(client);
  const navigation = normalizeNavigationReference(client, cache.capture(), "workspace", nav);
  client.setQueryData(pagesQueryKey("workspace"), navigation);
  const receipt = Promise.withResolvers<unknown>();
  const requests: Array<{ path: string; body: string }> = [];
  const controller = new DatabaseController(client, "session", (async (path, init) => {
    requests.push({ path, body: String(init?.body) });
    return receipt.promise;
  }) as ApiFetcher);
  try {
    const save = controller.execute({
      databaseId: "host",
      command: { type: "database.update", patch: { name: "Draft" } },
    });
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(resolveNavigationReference(client, navigation).databases[0]!.name, "Draft");
    const { commandId } = JSON.parse(requests[0]!.body);
    receipt.resolve({
      commandId,
      sourceVersions: {},
      result: {},
      event: {
        type: "database.mutation",
        protocolVersion: 2,
        actorId: "actor",
        commandId,
        databaseId: "host",
        dataSourceId: null,
        version: 2,
        eventId: "event",
        committedAt: stamp(2),
        areas: ["databases"],
        changes: {
          databases: [
            databaseHostEntitySchema.strip().parse({
              ...host,
              accessLevel: "edit",
              name: "Confirmed",
              version: 2,
              updatedAt: stamp(2),
            }),
          ],
        },
      },
    });
    await save;
    assert.equal(resolveNavigationReference(client, navigation).databases[0]!.name, "Confirmed");
    assert.equal(requests.length, 1);
    assert.equal(controller.getSnapshot().length, 0);
  } finally {
    controller.dispose();
    client.clear();
  }
});
