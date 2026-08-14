import assert from "node:assert/strict";
import { test } from "vitest";

import type { Database } from "../db";
import type { ZilobaseEditionExtension } from "../edition-extension";
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
    "insert",
    "audit:membership.granted",
  ]);
});

function createMembershipDatabase(
  rows: Array<Record<string, unknown>>,
  events: string[],
) {
  const database = {
    async transaction(run: (transaction: unknown) => Promise<unknown>) {
      events.push("transaction");
      return run(database);
    },
    select() {
      return {
        from() {
          return {
            where() {
              return { async limit() { return rows; } };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(value: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              return {
                async returning() {
                  events.push("insert");
                  const created = {
                    createdAt: new Date(),
                    ...value,
                  };
                  rows.push(created);
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
