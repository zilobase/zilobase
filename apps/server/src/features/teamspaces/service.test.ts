import assert from "node:assert/strict";
import { test } from "vitest";

import type { Database } from "../../db";
import { teamspace, teamspacePrincipal } from "../../db/schema";
import type { ZilobaseEditionExtension } from "../../edition-extension";
import { TeamspaceService } from "./service";

test("first default membership creates a General teamspace and owner", async () => {
  const events: string[] = [];
  const database = createTeamspaceDatabase(events);
  const extension = createExtension(events);

  const result = await new TeamspaceService(
    database,
    extension,
  ).ensureDefaultMembership({
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.equal(result.createdTeamspace, true);
  assert.equal(result.membershipsAdded, 1);
  assert.deepEqual(events, [
    "transaction",
    "insert:teamspace",
    "audit:teamspace.created",
    "insert:principal",
    "audit:teamspace.principal_added",
  ]);
});

test("subsequent default membership preserves the teamspace and adds a member", async () => {
  const events: string[] = [];
  const database = createTeamspaceDatabase(events);
  await new TeamspaceService(database).ensureDefaultMembership({
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  events.length = 0;

  const result = await new TeamspaceService(database).ensureDefaultMembership({
    userId: "user-2",
    workspaceId: "workspace-1",
  });

  assert.equal(result.createdTeamspace, false);
  assert.equal(result.membershipsAdded, 1);
  assert.deepEqual(events, ["transaction", "insert:principal"]);
});

function createExtension(events: string[]): ZilobaseEditionExtension {
  return {
    id: "enterprise",
    authPlugins: [],
    capabilities: [],
    async beforeMembershipGrant() {},
    async recordSecurityEvent(event) {
      events.push(`audit:${event.type}`);
    },
    registerRoutes() {},
  };
}

function createTeamspaceDatabase(events: string[]) {
  const teamspaces: Array<Record<string, unknown>> = [];
  const principals: Array<Record<string, unknown>> = [];
  const database = {
    async transaction(run: (transaction: unknown) => Promise<unknown>) {
      events.push("transaction");
      return run(database);
    },
    select() {
      return {
        from(table: unknown) {
          return {
            async where() {
              return table === teamspace ? teamspaces : principals;
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(value: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              return {
                async returning() {
                  const rows = table === teamspace ? teamspaces : principals;
                  const duplicate =
                    table === teamspace
                      ? rows.some(
                          (row) =>
                            row.workspaceId === value.workspaceId &&
                            row.name === value.name,
                        )
                      : rows.some(
                          (row) =>
                            row.teamspaceId === value.teamspaceId &&
                            row.principalId === value.principalId,
                        );
                  if (duplicate) return [];
                  const created = { createdAt: new Date(), ...value };
                  rows.push(created);
                  events.push(
                    table === teamspace
                      ? "insert:teamspace"
                      : "insert:principal",
                  );
                  return [created];
                },
              };
            },
          };
        },
      };
    },
    delete(table: unknown) {
      assert.equal(table, teamspacePrincipal);
      return { where: async () => undefined };
    },
  };

  return database as unknown as Database;
}
