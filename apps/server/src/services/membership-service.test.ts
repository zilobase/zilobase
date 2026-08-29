import assert from "node:assert/strict";
import { test } from "vitest";

import type { Database } from "../infrastructure/database";
import { member, teamspace, teamspacePrincipal } from "../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../shared/types";
import { MembershipService } from "./membership-service";

test("membership grants run edition policy and audit inside the transaction", async () => {
  const events: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const database = createMembershipDatabase(rows, events);
  const extension: ZilobaseEditionExtension = {
    id: "enterprise",
    authPlugins: [],
    capabilities: [],
    async beforeMembershipGrant(input) {
      assert.equal(input.database, database);
      events.push(`policy:${input.source}`);
    },
    async recordSecurityEvent(event) {
      assert.equal(event.database, database);
      events.push(`audit:${event.type}`);
    },
    registerRoutes() {},
  };

  const result = await new MembershipService(database, extension).grantMembership({
    role: "member",
    source: "sso-jit",
    userId: "user-1",
    workspaceId: "workspace-1",
  });

  assert.equal(result.created, true);
  assert.deepEqual(events, [
    "transaction",
    "policy:sso-jit",
    "insert:member",
    "insert:teamspace",
    "audit:teamspace.created",
    "insert:teamspace_principal",
    "audit:teamspace.principal_added",
    "audit:membership.granted",
  ]);
});

function createMembershipDatabase(
  rows: Array<Record<string, unknown>>,
  events: string[],
) {
  const teamspaceRows: Array<Record<string, unknown>> = [];
  const principalRows: Array<Record<string, unknown>> = [];
  const database = {
    async transaction(run: (transaction: unknown) => Promise<unknown>) {
      events.push("transaction");
      return run(database);
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              const selectedRows =
                table === member
                  ? rows
                  : table === teamspace
                    ? teamspaceRows
                    : principalRows;
              const result = Promise.resolve(selectedRows);

              return {
                limit: async () => selectedRows,
                then: result.then.bind(result),
              };
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
                  const selectedRows =
                    table === member
                      ? rows
                      : table === teamspace
                        ? teamspaceRows
                        : principalRows;
                  const created = {
                    createdAt: new Date(),
                    ...value,
                  };
                  selectedRows.push(created);
                  events.push(
                    table === member
                      ? "insert:member"
                      : table === teamspace
                        ? "insert:teamspace"
                        : "insert:teamspace_principal",
                  );
                  return [created];
                },
              };
            },
          };
        },
      };
    },
  };

  return database as unknown as Database;
}
