import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commit: vi.fn(),
  fetchView: vi.fn(),
  getPayload: vi.fn(),
  requireDatabase: vi.fn(),
  requireSource: vi.fn(),
  selectResults: [] as unknown[][],
}));

vi.mock("./database-access", () => ({
  requireDatabaseEditAccess: mocks.requireDatabase,
}));
vi.mock("./data-source-access", () => ({
  requireDataSourceAccess: mocks.requireSource,
}));
vi.mock("./database-commit", () => ({
  commitDatabaseMutation: mocks.commit,
}));
vi.mock("./database-delta", () => ({
  fetchDatabaseViewDelta: mocks.fetchView,
}));
vi.mock("./database-payload", () => ({
  getDatabasePayload: mocks.getPayload,
}));
vi.mock("../db", () => ({
  db: {
    select() {
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        async limit() { return rows; },
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import {
  createDatabaseDataSourceService,
  linkDatabaseDataSourceService,
  replaceDatabaseViewDataSourceService,
  unlinkDatabaseDataSourceService,
} from "./database-data-source-service";

beforeEach(() => {
  mocks.commit.mockReset();
  mocks.fetchView.mockReset();
  mocks.getPayload.mockReset();
  mocks.requireDatabase.mockReset();
  mocks.requireSource.mockReset();
  mocks.selectResults.length = 0;
  mocks.requireDatabase.mockResolvedValue({
    id: "host-1",
    workspaceId: "workspace-1",
  });
  mocks.requireSource.mockResolvedValue({
    id: "source-2",
    name: "Projects",
    parentDatabaseId: "database-2",
    workspaceId: "workspace-1",
  });
  vi.restoreAllMocks();
});

test("createDatabaseDataSourceService creates an owned source and its first view", async () => {
  const { inserts } = transactionRecorder();
  const sourceId = "00000000-0000-4000-8000-000000000001";
  const viewId = "00000000-0000-4000-8000-000000000002";
  mocks.selectResults.push([{ name: "Table", position: 0 }], [{ position: 0 }]);
  mocks.fetchView.mockResolvedValue({ views: [{ id: viewId }] });
  mocks.getPayload.mockResolvedValue({ database: { id: "host-1" } });
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(sourceId)
    .mockReturnValueOnce(viewId);

  const result = await createDatabaseDataSourceService({
    databaseId: "host-1",
    name: "Roadmap",
    userId: "user-1",
  });

  assert.equal(result.dataSourceId, sourceId);
  assert.deepEqual(inserts[0], {
    config: {},
    createdAt: inserts[0] && (inserts[0] as { createdAt: Date }).createdAt,
    createdById: "user-1",
    id: sourceId,
    name: "Roadmap",
    parentDatabaseId: "host-1",
    updatedAt: inserts[0] && (inserts[0] as { updatedAt: Date }).updatedAt,
    workspaceId: "workspace-1",
  });
  assert.deepEqual(inserts[1], {
    databaseId: "host-1",
    dataSourceId: sourceId,
    linkedById: "user-1",
    position: 1,
  });
  assert.deepEqual(inserts[2], {
    databaseId: "host-1",
    dataSourceId: sourceId,
    id: viewId,
    name: "Table 2",
    position: 1,
    type: "table",
  });
});

function transactionRecorder() {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    insert() {
      return {
        values(value: unknown) {
          inserts.push(value);
          return { async onConflictDoNothing() {} };
        },
      };
    },
    update() {
      return {
        set(value: unknown) {
          updates.push(value);
          return { async where() {} };
        },
      };
    },
  };
  mocks.commit.mockImplementation(async (_options, mutate) => mutate(tx));
  return { inserts, updates };
}

test("linkDatabaseDataSourceService links a source and creates one host-local view", async () => {
  const { inserts, updates } = transactionRecorder();
  mocks.selectResults.push(
    [{ name: "Projects", position: 0 }],
    [{ position: 0 }],
  );
  const newViewId = "00000000-0000-4000-8000-000000000001";
  mocks.fetchView.mockResolvedValue({ views: [{ id: newViewId }] });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(newViewId);

  const result = await linkDatabaseDataSourceService({
    databaseId: "host-1",
    dataSourceId: "source-2",
    type: "board",
    userId: "user-1",
  });

  assert.equal(result.viewId, newViewId);
  assert.deepEqual(inserts[0], {
    databaseId: "host-1",
    dataSourceId: "source-2",
    linkedById: "user-1",
    position: 1,
  });
  assert.deepEqual(inserts[1], {
    config: null,
    databaseId: "host-1",
    dataSourceId: "source-2",
    id: newViewId,
    name: "Projects 2",
    position: 1,
    type: "board",
  });
  assert.equal(updates.length, 0);
});

test("replaceDatabaseViewDataSourceService updates the same view instead of creating a tab", async () => {
  const { inserts, updates } = transactionRecorder();
  mocks.selectResults.push([{ id: "view-current" }], [{ position: 1 }]);
  mocks.fetchView.mockResolvedValue({
    views: [{ dataSourceId: "source-2", id: "view-current" }],
  });

  const result = await replaceDatabaseViewDataSourceService({
    databaseId: "host-1",
    dataSourceId: "source-2",
    userId: "user-1",
    viewId: "view-current",
  });

  assert.equal(result.viewId, "view-current");
  assert.equal(inserts.length, 1, "replacement may link the source but must not insert a view");
  assert.deepEqual(inserts[0], {
    databaseId: "host-1",
    dataSourceId: "source-2",
    linkedById: "user-1",
    position: 2,
  });
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { dataSourceId: string }).dataSourceId, "source-2");
});

test("unlinkDatabaseDataSourceService rejects an owned data source", async () => {
  mocks.requireSource.mockResolvedValue({
    id: "source-owned",
    name: "Owned",
    parentDatabaseId: "host-1",
    workspaceId: "workspace-1",
  });
  mocks.selectResults.push(
    [{ dataSourceId: "source-owned" }, { dataSourceId: "source-linked" }],
    [],
  );

  await assert.rejects(
    unlinkDatabaseDataSourceService({
      databaseId: "host-1",
      dataSourceId: "source-owned",
      userId: "user-1",
    }),
    /Owned data sources cannot be unlinked/,
  );
});
