import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][] }));

vi.mock("../../db", () => ({
  db: {
    select() {
      const rows = mocks.rows.shift() ?? [];
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        where: () => builder,
        limit: async () => rows,
      };
      return builder;
    },
  },
}));

import {
  getDatabaseTeamspaceSecurityPolicy,
  getPageTeamspaceSecurityPolicy,
} from "./security";

beforeEach(() => {
  mocks.rows = [];
});

test("teamspace security policies resolve page and database ceilings", async () => {
  const policy = {
    exportEnabled: false,
    guestsEnabled: false,
    publicSharingEnabled: false,
    teamspaceId: "teamspace-1",
  };
  mocks.rows.push([policy], [policy], []);

  assert.deepEqual(await getPageTeamspaceSecurityPolicy("page-1"), policy);
  assert.deepEqual(
    await getDatabaseTeamspaceSecurityPolicy("database-1"),
    policy,
  );
  assert.equal(await getPageTeamspaceSecurityPolicy("private-page"), null);
});
