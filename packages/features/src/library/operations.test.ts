import assert from "node:assert/strict";
import test from "node:test";
import { TestQueryClient } from "../data/testing";
import {
  createTestDatabasePayload,
  setTestDatabaseClientState,
} from "../databases/mutations/test-helpers";
import { resolveDatabaseBootstrap } from "../databases/cache-references";
import { databaseBootstrapQueryKey } from "../databases/queries/keys";
import type { DatabaseCommandRequest, DatabaseRecordEntity } from "../databases/core/entities";
import { sharedClient } from "../data/client";
import { createLibraryItem } from "./operations";
import { applyLibraryItemOrder, moveLibraryItem, type HomepageRow } from "./model";
import type { ApiFetcher } from "../shared/api-fetcher";

const parent = (kind: HomepageRow["itemKind"], id = "parent"): HomepageRow => ({
  id: `${kind}:${id}`,
  itemKind: kind,
  openPageId: kind === "page" ? id : null,
  openDatabaseId: null,
  teamspaceId: "team",
  parentRowId: null,
  position: 0,
  name: id,
  iconKind: "page",
  createdAt: "2026-10-24T00:00:00.000Z",
  createdBy: "",
  updatedAt: "2026-10-24T00:00:00.000Z",
  deletedAt: "",
  deletedBy: "",
  isFavorite: false,
  isShared: false,
  lastVisitedAt: null,
  metadata: null,
  openMeetingId: null,
  source: "",
  sourcePage: null,
});

test("Library creates root, nested and teamspace pages through the shared page operation", async () => {
  for (const container of [undefined, parent("page"), parent("teamspace")]) {
    const queryClient = new TestQueryClient();
    const calls: { path: string; input: Record<string, unknown> }[] = [];
    const apiFetch: ApiFetcher = async <T>(path: string, init?: RequestInit) => {
      const input = JSON.parse(String(init?.body));
      calls.push({ path, input });
      return {
        page: {
          id: "created",
          workspaceId: "workspace",
          name: "Untitled",
          metadata: {},
          content: null,
          type: "pageblock",
          createdAt: "2026-10-24T00:00:00.000Z",
          updatedAt: "2026-10-24T00:00:00.000Z",
        },
      } as T;
    };
    try {
      assert.deepEqual(
        await createLibraryItem(
          { apiFetch, queryClient },
          { workspaceId: "workspace", parent: container },
        ),
        { pageId: "created" },
      );
      assert.equal(calls[0]?.path, "/pages");
      assert.equal(
        calls[0]?.input.parentItemId,
        container?.itemKind === "page" ? "parent" : undefined,
      );
      assert.equal(calls[0]?.input.teamspaceId, container ? "team" : undefined);
      assert.equal(calls[0]?.input.workspaceId, "workspace");
    } finally {
      queryClient.clear();
    }
  }
});

test("Library rejects noncontainers and expired creates cannot start a follow-up favorite write", async () => {
  const queryClient = new TestQueryClient();
  const calls: string[] = [];
  const apiFetch: ApiFetcher = async <T>(path: string) => {
    calls.push(path);
    sharedClient(queryClient).clear();
    return { page: { id: "created", workspaceId: "workspace" } } as T;
  };
  try {
    await assert.rejects(
      createLibraryItem(
        { apiFetch, queryClient },
        { workspaceId: "workspace", parent: parent("meeting") },
      ),
      /cannot contain/,
    );
    assert.equal(calls.length, 0);
    await assert.rejects(
      createLibraryItem({ apiFetch, queryClient }, { workspaceId: "workspace", favorite: true }),
    );
    assert.deepEqual(calls, ["/pages"]);
  } finally {
    queryClient.clear();
  }
});

test("Library order preserves unseen items, ignores removed references and leaves hierarchy intact", () => {
  const rows = [
    parent("page", "a"),
    parent("page", "b"),
    { ...parent("page", "child"), parentRowId: "page:a" },
  ];
  const order = moveLibraryItem(
    rows.map((row) => row.id),
    { rowId: "page:b", beforeRowId: "page:a", afterRowId: null },
  );
  assert.deepEqual(order, ["page:b", "page:a", "page:child"]);
  const ordered = applyLibraryItemOrder(rows, ["removed", "page:b", "page:b", "page:a"]);
  assert.deepEqual(
    ordered.map((row) => row.id),
    order,
  );
  assert.equal(ordered[2]?.parentRowId, "page:a");
  assert.equal(rows[0]?.position, 0);
  assert.throws(
    () => moveLibraryItem(order, { rowId: "page:b", beforeRowId: "removed", afterRowId: null }),
    /changed/,
  );
});

test("Library database children resolve the real source before sending a row command", async () => {
  const queryClient = new TestQueryClient();
  const payload = createTestDatabasePayload();
  setTestDatabaseClientState(queryClient, payload);
  const bootstrap = resolveDatabaseBootstrap(
    queryClient,
    queryClient.getQueryData(
      databaseBootstrapQueryKey("test-session", { databaseId: "database-1" }),
    ),
  )!;
  const calls: string[] = [];
  const record: DatabaseRecordEntity = {
    id: "new-row",
    dataSourceId: "data-source-1",
    pageId: "new-page",
    parentRowId: null,
    createdAt: "2026-10-24T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    orderKey: "3072.0000000000",
    valuesByPropertyId: {},
    page: {
      id: "new-page",
      name: "Untitled",
      deletedAt: null,
      metadata: {},
      hasContent: false,
      createdAt: "2026-10-24T00:00:00.000Z",
      updatedAt: "2026-10-24T00:00:00.000Z",
    },
  };
  const apiFetch: ApiFetcher = async <T>(path: string, init?: RequestInit) => {
    calls.push(path);
    if (path.endsWith("/bootstrap")) return bootstrap as T;
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
    assert.equal(request.command.type, "row.place");
    assert.equal(path, "/databases/database-1/data-sources/data-source-1/commands");
    return {
      commandId: request.commandId,
      sourceVersions: { "data-source-1": 2 },
      result: record,
      event: {
        actorId: "actor",
        areas: ["records"],
        changes: { records: [record], sourceVersions: { "data-source-1": 2 } },
        commandId: request.commandId,
        committedAt: "2026-10-24T00:00:00.000Z",
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        eventId: `event-${request.commandId}`,
        protocolVersion: 2,
        type: "database.mutation",
        version: 1,
      },
    } as T;
  };
  try {
    assert.deepEqual(
      await createLibraryItem(
        { apiFetch, queryClient },
        { workspaceId: "org-1", parent: { ...parent("database"), openDatabaseId: "database-1" } },
      ),
      { pageId: "new-page" },
    );
    assert.deepEqual(calls, [
      "/databases/database-1/bootstrap",
      "/databases/database-1/data-sources/data-source-1/commands",
    ]);
  } finally {
    queryClient.clear();
  }
});
