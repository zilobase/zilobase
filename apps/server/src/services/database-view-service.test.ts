import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  commit: vi.fn(),
  fetchDelta: vi.fn(),
  selectResults: [] as unknown[][],
}));

vi.mock("./database-access", () => ({
  requireDatabaseEditAccess: mocks.access,
}));
vi.mock("./database-commit", () => ({
  commitDatabaseMutation: mocks.commit,
}));
vi.mock("./database-delta", () => ({
  fetchDatabaseViewDelta: mocks.fetchDelta,
}));
vi.mock("../db", () => ({
  db: {
    select() {
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        where() { return builder; },
        async orderBy() { return rows; },
        async limit() { return rows; },
      };
      return builder;
    },
  },
}));

import {
  createDatabaseViewService,
  updateDatabaseViewService,
} from "./database-view-service";
import { ServiceMutationError } from "./mutation-error";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.commit.mockReset();
  mocks.fetchDelta.mockReset();
  mocks.selectResults.length = 0;
  vi.restoreAllMocks();
});

function transactionRecorder() {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    insert() {
      return {
        async values(value: unknown) { inserts.push(value); },
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

test("createDatabaseViewService creates a uniquely named trailing view", async () => {
  const { inserts } = transactionRecorder();
  mocks.selectResults.push([
    { name: "Board", position: 0 },
    { name: "Board 2", position: 1 },
  ]);
  mocks.fetchDelta.mockResolvedValue({ views: [{ id: "view-1" }] });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );

  const result = await createDatabaseViewService({
    config: { layout: "compact" },
    databaseId: "database-1",
    env: { ENV: "test" },
    name: " Board ",
    type: " board ",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    databaseId: "database-1",
    name: "Board 3",
    type: "board",
    viewId: "00000000-0000-4000-8000-000000000001",
  });
  assert.deepEqual(inserts[0], {
    config: { layout: "compact" },
    createdAt: (inserts[0] as Record<string, unknown>).createdAt,
    databaseId: "database-1",
    id: "00000000-0000-4000-8000-000000000001",
    name: "Board 3",
    position: 2,
    type: "board",
    updatedAt: (inserts[0] as Record<string, unknown>).updatedAt,
  });
  assert.equal(
    (inserts[0] as Record<string, unknown>).createdAt,
    (inserts[0] as Record<string, unknown>).updatedAt,
  );
  assert.deepEqual(mocks.commit.mock.calls[0]?.[0], {
    actorId: "user-1",
    changed: ["views"],
    databaseId: "database-1",
    env: { ENV: "test" },
  });
});

test("createDatabaseViewService applies table defaults and empty deltas", async () => {
  const { inserts } = transactionRecorder();
  mocks.selectResults.push([]);
  mocks.fetchDelta.mockResolvedValue(null);

  const result = await createDatabaseViewService({
    databaseId: "database-1",
    userId: "user-1",
  });

  assert.equal(result.name, "Table");
  assert.equal(result.type, "table");
  assert.equal((inserts[0] as Record<string, unknown>).config, null);
  assert.deepEqual((await mocks.commit.mock.results[0]?.value)?.delta, {
    views: [],
  });
});

test("updateDatabaseViewService updates supplied view fields", async () => {
  const { updates } = transactionRecorder();
  mocks.selectResults.push([{ id: "view-1" }]);
  mocks.fetchDelta.mockResolvedValue({ views: [{ id: "view-1" }] });

  const result = await updateDatabaseViewService({
    config: { filter: true },
    databaseId: "database-1",
    name: "Filtered",
    type: "board",
    userId: "user-1",
    viewId: "view-1",
  });

  assert.deepEqual(result, { databaseId: "database-1", viewId: "view-1" });
  assert.deepEqual(updates[0], {
    config: { filter: true },
    name: "Filtered",
    type: "board",
    updatedAt: (updates[0] as Record<string, unknown>).updatedAt,
  });
});

test("updateDatabaseViewService rejects missing views", async () => {
  mocks.selectResults.push([]);

  await assert.rejects(
    updateDatabaseViewService({
      databaseId: "database-1",
      userId: "user-1",
      viewId: "missing",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );
  assert.equal(mocks.commit.mock.calls.length, 0);
});
