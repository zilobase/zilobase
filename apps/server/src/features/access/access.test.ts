import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ancestorIds: ["page-1"] as string[],
  hasOwnedRootAccess: vi.fn(),
  pageSecurityPolicy: vi.fn(),
  selectCalls: 0,
  selectResults: [] as unknown[][],
  teamspaceId: null as string | null,
}));

vi.mock("../../infrastructure/database", () => ({
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
vi.mock("../pages/graph", () => ({
  async loadWorkspacePageGraph() {
    return {
      getAncestorIds: () => mocks.ancestorIds,
      getTeamspaceId: () => mocks.teamspaceId,
      hasOwnedRootAccess: mocks.hasOwnedRootAccess,
    };
  },
}));
vi.mock("../teamspaces", () => ({
  getDatabaseTeamspaceSecurityPolicy: vi.fn(),
  getPageTeamspaceSecurityPolicy: mocks.pageSecurityPolicy,
}));

import {
  canAccessDatabaseInWorkspace,
  canAccessDatabaseRecord,
  canAccessPageInWorkspace,
  getEffectiveDatabaseAccessForRecord,
  getEffectiveDatabaseAccessInWorkspace,
  getEffectivePageAccessInWorkspace,
  getEffectiveTeamspaceAccessInWorkspace,
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
  mocks.teamspaceId = null;
  mocks.pageSecurityPolicy.mockReset();
  mocks.pageSecurityPolicy.mockResolvedValue({
    guestsEnabled: true,
    publicSharingEnabled: true,
  });
});

test("access primitives normalize and rank supported levels", () => {
  assert.equal(normalizeAccessLevel("edit"), "edit");
  assert.equal(normalizeAccessLevel("comment"), "comment");
  assert.equal(normalizeAccessLevel("invalid"), null);
  assert.equal(hasAccess("edit", "view"), true);
  assert.equal(hasAccess("comment", "view"), true);
  assert.equal(hasAccess("comment", "edit"), false);
  assert.equal(hasAccess("view", "full"), false);
  assert.equal(isPrivilegedOrgRole("owner"), true);
  assert.equal(isPrivilegedOrgRole("member"), false);
});

test("teamspace access resolves member overrides, owners, and archives", async () => {
  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [{ teamId: "team-1" }],
    [{ archivedAt: null, memberAccessLevel: "edit" }],
    [{ accessLevelOverride: "comment", role: "member" }],
  );
  assert.equal(
    await getEffectiveTeamspaceAccessInWorkspace(
      "teamspace-1",
      "workspace-1",
      "user-1",
    ),
    "comment",
  );

  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [],
    [{ archivedAt: null, memberAccessLevel: "view" }],
    [{ accessLevelOverride: null, role: "owner" }],
  );
  assert.equal(
    await getEffectiveTeamspaceAccessInWorkspace(
      "teamspace-1",
      "workspace-1",
      "user-1",
    ),
    "full",
  );

  mocks.selectResults.push([]);
  assert.equal(
    await getEffectiveTeamspaceAccessInWorkspace(
      "teamspace-1",
      "workspace-1",
      "user-1",
    ),
    "none",
  );

  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [],
    [{ archivedAt: new Date(), memberAccessLevel: "edit" }],
  );
  assert.equal(
    await getEffectiveTeamspaceAccessInWorkspace(
      "teamspace-1",
      "workspace-1",
      "user-1",
    ),
    "none",
  );
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
  mocks.selectResults.push([], []);

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

test("page guests receive only explicit inherited user access", async () => {
  mocks.selectResults.push(
    [],
    [{ id: "guest-1" }],
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

  mocks.selectCalls = 0;
  mocks.selectResults.push([], [{ id: "guest-1" }], []);
  assert.equal(
    await getEffectivePageAccessInWorkspace(
      "page-1",
      "workspace-1",
      "user-1",
    ),
    "none",
  );
  assert.equal(mocks.selectCalls, 3);
});

test("teamspace guest ceilings override existing explicit page rules", async () => {
  mocks.teamspaceId = "teamspace-1";
  mocks.pageSecurityPolicy.mockResolvedValue({ guestsEnabled: false });
  mocks.selectResults.push(
    [],
    [{ id: "guest-1" }],
    [{ accessLevel: "edit" }],
  );

  assert.equal(
    await getEffectivePageAccessInWorkspace(
      "page-1",
      "workspace-1",
      "guest-1",
    ),
    "none",
  );
});

test("page access resolves ownership and the strongest shared rule", async () => {
  mocks.hasOwnedRootAccess.mockReturnValue(true);
  mocks.selectResults.push([{ id: "membership-1" }], [], []);
  assert.equal(
    await getEffectivePageAccessInWorkspace(
      "page-1",
      "workspace-1",
      "user-1",
    ),
    "full",
  );
  assert.equal(mocks.selectCalls, 3);

  mocks.hasOwnedRootAccess.mockReturnValue(false);
  mocks.selectCalls = 0;
  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [],
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
  assert.equal(mocks.selectCalls, 4);
});

test("standalone page fallback reuses verified membership and team IDs", async () => {
  mocks.selectResults.push(
    [{ id: "membership-1" }],
    [],
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
  assert.equal(mocks.selectCalls, 7);
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
  mocks.selectResults.push([{ id: "membership-1" }], [], []);

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
  assert.equal(mocks.selectCalls, 3);

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
