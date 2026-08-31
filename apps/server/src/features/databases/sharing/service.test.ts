import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conflict: vi.fn(),
  delete: vi.fn(),
  insert: vi.fn(),
  insertRows: [] as unknown[],
  requireAccess: vi.fn(),
  securityPolicy: vi.fn(),
  select: vi.fn(),
  selectResults: [] as unknown[][],
  values: vi.fn(),
}));

vi.mock("../access/database-access", () => ({
  requireDatabaseAccess: mocks.requireAccess,
}));
vi.mock("../../teamspaces", () => ({
  getDatabaseTeamspaceSecurityPolicy: mocks.securityPolicy,
}));
vi.mock("../../../infrastructure/database", () => ({
  db: (() => {
    const databaseMock = {
    delete() {
      return {
        async where(value: unknown) { mocks.delete(value); },
      };
    },
    insert() {
      mocks.insert();
      return {
        values(value: unknown) {
          mocks.values(value);
          return {
            onConflictDoUpdate(config: unknown) {
              mocks.conflict(config);
              return {
                async returning() { return mocks.insertRows; },
              };
            },
          };
        },
      };
    },
    select() {
      mocks.select();
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
      async transaction(callback: (tx: unknown) => Promise<unknown>) {
        return callback(databaseMock);
      },
    };
    return databaseMock;
  })(),
}));
vi.mock("../../workspaces/navigation-realtime/outbox", () => ({
  enqueueNavigationInvalidation: vi.fn(async () => ({
    committedAt: new Date(),
    id: "navigation-event-1",
    workspaceId: "workspace-1",
  })),
  publishCommittedNavigationInvalidation: vi.fn(async () => true),
}));

import {
  deleteDatabaseAccessRuleService,
  deletePublicDatabaseAccessService,
  listDatabaseAccessRulesService,
  upsertDatabaseAccessRuleService,
} from "./service";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

beforeEach(() => {
  mocks.conflict.mockReset();
  mocks.delete.mockReset();
  mocks.insert.mockReset();
  mocks.insertRows = [];
  mocks.requireAccess.mockReset();
  mocks.requireAccess.mockResolvedValue({
    id: "database-1",
    workspaceId: "workspace-1",
  });
  mocks.select.mockReset();
  mocks.securityPolicy.mockReset();
  mocks.securityPolicy.mockResolvedValue(null);
  mocks.selectResults = [];
  mocks.values.mockReset();
  vi.restoreAllMocks();
});

test("listDatabaseAccessRulesService returns ordered rules", async () => {
  const rules = [{ id: "rule-1" }, { id: "rule-2" }];
  mocks.selectResults = [rules];

  assert.deepEqual(
    await listDatabaseAccessRulesService({
      databaseId: "database-1",
      userId: "user-1",
    }),
    { access: rules },
  );
  assert.deepEqual(mocks.requireAccess.mock.calls[0], [
    "database-1",
    "user-1",
    "full",
  ]);
});

test("upsertDatabaseAccessRuleService creates public view access", async () => {
  const rule = { id: "rule-1", targetId: "*", targetType: "public" };
  mocks.insertRows = [rule];
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );

  assert.deepEqual(
    await upsertDatabaseAccessRuleService({
      body: { accessLevel: "view", targetId: "*", targetType: "public" },
      databaseId: "database-1",
      userId: "user-1",
    }),
    { access: rule },
  );
  assert.equal(mocks.select.mock.calls.length, 0);
  assert.deepEqual(mocks.values.mock.calls[0]?.[0], {
    accessLevel: "view",
    databaseId: "database-1",
    id: "00000000-0000-4000-8000-000000000001",
    targetId: "*",
    targetType: "public",
    workspaceId: "workspace-1",
  });
  assert.equal(mocks.conflict.mock.calls.length, 1);
});

test("teamspace security can disable database public sharing", async () => {
  mocks.securityPolicy.mockResolvedValue({ publicSharingEnabled: false });

  await assert.rejects(
    upsertDatabaseAccessRuleService({
      body: { accessLevel: "view", targetId: "*", targetType: "public" },
      databaseId: "database-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );
  assert.equal(mocks.insert.mock.calls.length, 0);
});

for (const targetType of ["user", "team"] as const) {
  test(`upsertDatabaseAccessRuleService validates a workspace ${targetType}`, async () => {
    const rule = { id: `rule-${targetType}`, targetId: `${targetType}-1` };
    mocks.selectResults = [[{ id: `workspace-${targetType}` }]];
    mocks.insertRows = [rule];

    assert.deepEqual(
      await upsertDatabaseAccessRuleService({
        body: {
          accessLevel: "edit",
          targetId: `${targetType}-1`,
          targetType,
        },
        databaseId: "database-1",
        userId: "user-1",
      }),
      { access: rule },
    );
    assert.equal(mocks.select.mock.calls.length, 1);
  });
}

test("upsertDatabaseAccessRuleService rejects targets outside the workspace", async () => {
  mocks.selectResults = [[]];

  await assert.rejects(
    upsertDatabaseAccessRuleService({
      body: { accessLevel: "view", targetId: "user-2", targetType: "user" },
      databaseId: "database-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError &&
      error.status === 404 &&
      error.message === "Target not found",
  );
  assert.equal(mocks.insert.mock.calls.length, 0);
});

for (const [body, message] of [
  [null, "A JSON body is required"],
  [{ targetType: "invalid" }, "targetType must be public, user, or team"],
  [{ targetType: "user" }, "targetId is required"],
  [
    { targetId: "user-1", targetType: "user" },
    "accessLevel must be view, edit, or full",
  ],
  [
    { accessLevel: "full", targetId: "*", targetType: "public" },
    "public access must be view for *",
  ],
] as const) {
  test(`upsertDatabaseAccessRuleService rejects: ${message}`, async () => {
    await assert.rejects(
      upsertDatabaseAccessRuleService({
        body,
        databaseId: "database-1",
        userId: "user-1",
      }),
      (error: unknown) =>
        error instanceof ServiceMutationError &&
        error.status === 400 &&
        error.message === message,
    );
  });
}

test("upsertDatabaseAccessRuleService checks access before body validation", async () => {
  mocks.requireAccess.mockRejectedValue(
    new ServiceMutationError("Forbidden", 403),
  );

  await assert.rejects(
    upsertDatabaseAccessRuleService({
      body: null,
      databaseId: "database-1",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof ServiceMutationError && error.status === 403,
  );
});

test("database access deletion services remove scoped rules", async () => {
  assert.deepEqual(
    await deletePublicDatabaseAccessService({
      databaseId: "database-1",
      userId: "user-1",
    }),
    { access: null },
  );
  assert.deepEqual(
    await deleteDatabaseAccessRuleService({
      databaseId: "database-1",
      ruleId: "rule-1",
      userId: "user-1",
    }),
    { access: null },
  );
  assert.equal(mocks.delete.mock.calls.length, 2);
  assert.deepEqual(mocks.requireAccess.mock.calls, [
    ["database-1", "user-1", "full"],
    ["database-1", "user-1", "full"],
  ]);
});
