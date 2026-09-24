import assert from "node:assert/strict";
import { test, vi } from "vitest";

const state = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  selects: 0,
  index: {
    gmailAccountId: "account",
    status: "backfilling",
    generation: 1,
    indexedThreadCount: 20,
    nextPageToken: "next-page",
    historyId: "history",
    startedAt: new Date(),
    completedAt: null,
    lastErrorCode: null,
    leaseToken: null,
    leaseExpiresAt: null,
  },
}));
vi.mock("../../../infrastructure/database", async (original) => ({
  ...(await original<typeof import("../../../infrastructure/database")>()),
  db: {
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        limit: async () =>
          ++state.selects === 1 ? [{ id: "account", status: "connected" }] : [state.index],
      };
      return query;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return { where: () => ({ returning: async () => [{ ...state.index, ...values }] }) };
      },
    }),
  },
}));
vi.mock("../provider/gmail-gateway", async (original) => {
  const module = await original<typeof import("../provider/gmail-gateway")>();
  return {
    ...module,
    createGmailGateway: async () => {
      throw new module.GmailApiError("Quota exhausted", 429, "quota_exceeded", true, 120_000);
    },
  };
});
import { advanceMailIndex } from "./mailbox-sync-engine";

test("quota failure persists a cooldown while preserving the indexing cursor and releasing ownership", async () => {
  const before = Date.now();
  const result = await advanceMailIndex({}, "account");
  assert.equal(result.status, "error");
  assert.equal(state.updates[1]?.lastErrorCode, "quota_exceeded");
  const release = state.updates.at(-1)!;
  assert.equal(release.leaseToken, null);
  assert.ok(release.leaseExpiresAt instanceof Date);
  assert.ok(release.leaseExpiresAt.getTime() >= before + 120_000);
  assert.ok(state.updates.every((update) => !("nextPageToken" in update)));
});
