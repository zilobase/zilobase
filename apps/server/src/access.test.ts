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
  getEffectiveDatabaseAccessInWorkspace,
  getEffectivePageAccessInWorkspace,
} from "./access";

beforeEach(() => {
  mocks.ancestorIds = ["page-1"];
  mocks.hasOwnedRootAccess.mockReset();
  mocks.hasOwnedRootAccess.mockReturnValue(false);
  mocks.selectCalls = 0;
  mocks.selectResults.length = 0;
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
