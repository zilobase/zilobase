import assert from "node:assert/strict";
import { test, vi } from "vitest";

import {
  getDatabaseRecord,
  requireDatabaseEditAccess,
} from "./database-access";
import { ServiceMutationError } from "./mutation-error";

function executor(records: unknown[]) {
  const builder = {
    from() { return builder; },
    where() { return builder; },
    async limit() { return records; },
  };
  return { select: () => builder };
}

test("getDatabaseRecord returns active records and absence", async () => {
  const record = { id: "database-1", workspaceId: "workspace-1" };
  assert.equal(
    await getDatabaseRecord("database-1", executor([record]) as never),
    record,
  );
  assert.equal(
    await getDatabaseRecord("missing", executor([]) as never),
    undefined,
  );
});

test("getDatabaseRecord supports include-deleted options", async () => {
  const record = { id: "database-1", workspaceId: "workspace-1" };

  assert.equal(
    await getDatabaseRecord("database-1", {
      executor: executor([record]) as never,
      includeDeleted: true,
    }),
    record,
  );
});

test("requireDatabaseEditAccess returns authorized records", async () => {
  const record = { id: "database-1", workspaceId: "workspace-1" };
  const canAccess = vi.fn(async () => true);

  assert.equal(
    await requireDatabaseEditAccess("database-1", "user-1", {
      canAccess,
      executor: executor([record]) as never,
    }),
    record,
  );
  assert.deepEqual(canAccess.mock.calls[0], [
    "database-1",
    "workspace-1",
    "user-1",
    "edit",
  ]);
});

test("requireDatabaseEditAccess distinguishes missing and forbidden databases", async () => {
  await assert.rejects(
    requireDatabaseEditAccess("missing", "user-1", {
      executor: executor([]) as never,
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 404,
  );
  await assert.rejects(
    requireDatabaseEditAccess("database-1", "user-1", {
      canAccess: async () => false,
      executor: executor([
        { id: "database-1", workspaceId: "workspace-1" },
      ]) as never,
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );
});
