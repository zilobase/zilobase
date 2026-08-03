import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ancestorIds: ["page-1"] as string[],
  hasOwnedRootAccess: vi.fn(),
  selectCalls: 0,
  selectResults: [] as unknown[][],
}));

vi.mock("./db", () => ({
  db: {
    select() {
      mocks.selectCalls += 1;
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        innerJoin() { return builder; },
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
vi.mock("./page-graph-loader", () => ({
  async loadWorkspacePageGraph() {
    return {
      getAncestorIds: () => mocks.ancestorIds,
      hasOwnedRootAccess: mocks.hasOwnedRootAccess,
    };
  },
}));

import {
  canAccessDatabaseInWorkspace,
  canAccessDatabaseRecord,
  canAccessPageInWorkspace,
  getEffectiveDatabaseAccessForRecord,
  getEffectiveDatabaseAccessInWorkspace,
  getEffectivePageAccessInWorkspace,
  hasAccess,
  isPrivilegedOrgRole,
  isWorkspaceMember,
  normalizeAccessLevel,
} from "./access";

beforeEach(() => {
  mocks.ancestorIds = ["page-1"];
  mocks.hasOwnedRootAccess.mockReset();
  mocks.hasOwnedRootAccess.mockReturnValue(false);
  mocks.selectCalls = 0;
  mocks.selectResults.length = 0;
});

test("access primitives normalize and rank supported levels", () => {
  assert.equal(normalizeAccessLevel("edit"), "edit");
  assert.equal(normalizeAccessLevel("invalid"), null);
  assert.equal(hasAccess("edit", "view"), true);
  assert.equal(hasAccess("view", "full"), false);
  assert.equal(isPrivilegedOrgRole("owner"), true);
  assert.equal(isPrivilegedOrgRole("member"), false);
});

test("public access wrappers preserve membership and rank decisions", async () => {
  mocks.selectResults.push([{ id: "membership-1" }]);
  assert.equal(
    await isWorkspaceMember("workspace-1", "user-1"),
    true,
  );

  mocks.hasOwnedRootAccess.mockReturnValue(true);
  mocks.selectResults.push([{ id: "membership-1" }], []);
  assert.equal(
    await canAccessPageInWorkspace(
      "page-1",
      "workspace-1",
      "user-1",
      "edit",
    ),
    true,
  );

  mocks.selectResults.push([]);
  assert.equal(
    await canAccessDatabaseInWorkspace(
      "missing",
      "workspace-1",
      "user-1",
      "view",
    ),
    false,
  );
});

test("page access stops when workspace membership is missing", async () => {
  mocks.selectResults.push([], [{ teamId: "team-1" }]);

  assert.equal(
    await getEffectivePageAccessInWorkspace(
      "page-1",
      "workspace-1",
      "user-1",
    ),
    "none",
  );
  assert.equal(mocks.selectCalls, 2);
});

test("page access resolves ownership and the strongest shared rule", async () => {
  mocks.hasOwnedRootAccess.mockReturnValue(true);
  mocks.selectResults.push([{ id: "membership-1" }], []);
  assert.equal(
    await getEffectivePageAccessInWorkspace(
      "page-1",
      "workspace-1",
      "user-1",
    ),
    "full",
  );
  assert.equal(mocks.selectCalls, 2);

  mocks.hasOwnedRootAccess.mockReturnValue(false);
  mocks.selectCalls = 0;
  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [],
    [{ accessLevel: "view" }, { accessLevel: "edit" }],
  );
  assert.equal(
    await getEffectivePageAccessInWorkspace(
      "page-1",
      "workspace-1",
      "user-1",
    ),
    "edit",
  );
  assert.equal(mocks.selectCalls, 3);
});

test("standalone page fallback reuses verified membership and team IDs", async () => {
  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [{ teamId: "team-1" }],
    [],
    [{ databaseId: "database-1" }],
    [{ createdById: "user-2", pageId: null }],
    [{ accessLevel: "edit" }],
  );

  assert.equal(
    await getEffectivePageAccessInWorkspace(
      "page-1",
      "workspace-1",
      "user-1",
    ),
    "edit",
  );
  assert.equal(mocks.selectCalls, 6);
  assert.equal(mocks.selectResults.length, 0);
});

test("direct standalone database access verifies membership", async () => {
  mocks.selectResults.push(
    [{ createdById: "user-2", pageId: null }],
    [],
  );

  assert.equal(
    await getEffectiveDatabaseAccessInWorkspace(
      "database-1",
      "workspace-1",
      "user-1",
    ),
    "none",
  );
  assert.equal(mocks.selectCalls, 2);

  mocks.selectCalls = 0;
  mocks.selectResults.push(
    [{ createdById: "user-1", pageId: null }],
    [{ id: "membership-1" }],
  );
  assert.equal(
    await getEffectiveDatabaseAccessInWorkspace(
      "database-1",
      "workspace-1",
      "user-1",
    ),
    "full",
  );
  assert.equal(mocks.selectCalls, 2);
});

test("direct standalone database access resolves team rules", async () => {
  mocks.selectResults.push(
    [{ createdById: "user-2", pageId: null }],
    [{ id: "membership-1" }],
    [{ teamId: "team-1" }],
    [{ accessLevel: "view" }, { accessLevel: "edit" }],
  );

  assert.equal(
    await getEffectiveDatabaseAccessInWorkspace(
      "database-1",
      "workspace-1",
      "user-1",
    ),
    "edit",
  );
  assert.equal(mocks.selectCalls, 4);

  mocks.selectCalls = 0;
  mocks.selectResults.push([]);
  assert.equal(
    await getEffectiveDatabaseAccessInWorkspace(
      "missing",
      "workspace-1",
      "user-1",
    ),
    "none",
  );
  assert.equal(mocks.selectCalls, 1);
});

test("record-based database access skips the database reload", async () => {
  mocks.hasOwnedRootAccess.mockReturnValue(true);
  mocks.selectResults.push([{ id: "membership-1" }], []);

  assert.equal(
    await getEffectiveDatabaseAccessForRecord(
      {
        createdById: "user-2",
        id: "database-1",
        pageId: "page-1",
        workspaceId: "workspace-1",
      },
      "user-1",
    ),
    "full",
  );
  assert.equal(mocks.selectCalls, 2);

  mocks.hasOwnedRootAccess.mockReturnValue(false);
  mocks.selectCalls = 0;
  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [{ teamId: "team-1" }],
    [{ accessLevel: "edit" }],
  );
  assert.equal(
    await getEffectiveDatabaseAccessForRecord(
      {
        createdById: "user-2",
        id: "database-1",
        pageId: null,
        workspaceId: "workspace-1",
      },
      "user-1",
    ),
    "edit",
  );
  assert.equal(mocks.selectCalls, 3);
});

test("record-based database access preserves required-level checks", async () => {
  mocks.selectResults.push([{ id: "membership-1" }]);

  assert.equal(
    await canAccessDatabaseRecord(
      {
        createdById: "user-1",
        id: "database-1",
        pageId: null,
        workspaceId: "workspace-1",
      },
      "user-1",
      "full",
    ),
    true,
  );
  assert.equal(mocks.selectCalls, 1);

  assert.equal(
    await getEffectiveDatabaseAccessForRecord(
      {
        createdById: "user-1",
        deletedAt: new Date(),
        id: "database-1",
        pageId: null,
        workspaceId: "workspace-1",
      },
      "user-1",
    ),
    "none",
  );
  assert.equal(mocks.selectCalls, 1);
});
