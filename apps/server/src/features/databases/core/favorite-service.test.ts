import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conflict: vi.fn(),
  delete: vi.fn(),
  payload: vi.fn(),
  requireAccess: vi.fn(),
  values: vi.fn(),
}));

vi.mock("../access/database-access", () => ({
  requireDatabaseAccess: mocks.requireAccess,
}));
vi.mock("./payload", () => ({
  getDatabasePayload: mocks.payload,
}));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    delete() {
      return {
        async where(value: unknown) { mocks.delete(value); },
      };
    },
    insert() {
      return {
        values(value: unknown) {
          mocks.values(value);
          return {
            async onConflictDoNothing(config: unknown) {
              mocks.conflict(config);
            },
          };
        },
      };
    },
  },
}));

import { updateDatabaseFavoriteService } from "./favorite-service";

beforeEach(() => {
  mocks.conflict.mockReset();
  mocks.delete.mockReset();
  mocks.payload.mockReset();
  mocks.payload.mockResolvedValue({ database: { id: "database-1" } });
  mocks.requireAccess.mockReset();
  mocks.requireAccess.mockResolvedValue({
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.values.mockReset();
  vi.restoreAllMocks();
});

test("updateDatabaseFavoriteService adds a favorite idempotently", async () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );

  const result = await updateDatabaseFavoriteService({
    databaseId: "database-1",
    favorite: true,
    userId: "user-1",
  });

  assert.deepEqual(mocks.requireAccess.mock.calls[0], [
    "database-1",
    "user-1",
    "view",
  ]);
  assert.deepEqual(mocks.values.mock.calls[0]?.[0], {
    databaseId: "database-1",
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-1",
  });
  assert.equal(mocks.conflict.mock.calls.length, 1);
  assert.deepEqual(result, { database: { id: "database-1" } });
});

test("updateDatabaseFavoriteService removes a favorite and reuses the record", async () => {
  const existing = { id: "database-1", workspaceId: "workspace-1" };
  mocks.requireAccess.mockResolvedValue(existing);

  await updateDatabaseFavoriteService({
    databaseId: "database-1",
    favorite: false,
    userId: "user-1",
  });

  assert.equal(mocks.delete.mock.calls.length, 1);
  assert.deepEqual(mocks.payload.mock.calls[0], [
    "database-1",
    "user-1",
    existing,
  ]);
  assert.equal(mocks.values.mock.calls.length, 0);
});
