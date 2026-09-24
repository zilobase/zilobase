import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { newerHistory } from "./mail-sync-coordinator";

test("history intent is monotonic for decimal Gmail cursors", () => {
  assert.equal(newerHistory("101", "100"), true);
  assert.equal(newerHistory("100", "100"), false);
  assert.equal(newerHistory("99", "100"), false);
  assert.equal(newerHistory("100", null), true);
});

test("coordinator uses durable due ordering and one account resource key", async () => {
  const source = await readFile(new URL("./mail-sync-coordinator.ts", import.meta.url), "utf8");
  assert.match(source, /desiredHistoryId/);
  assert.match(source, /leaseExpiresAt/);
  assert.match(source, /orderBy\(asc\(mailIndexState\.nextAttemptAt\)/);
  assert.match(source, /resourceId: input\.gmailAccountId/);
});
