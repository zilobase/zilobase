import assert from "node:assert/strict";
import { test, vi } from "vitest";

import {
  hasDuplicateValues,
  incrementDatabaseRowPlacementPositions,
  lockDatabaseRowOrderingSources,
  rebalanceDatabaseRowOrderKeys,
  updateDatabaseRowCompatibilityPositions,
  updateDatabasePropertyPositions,
  updateDatabaseRowPlacementPositions,
  updateDatabaseRowPositions,
} from "./position-service";

const updatedAt = new Date("2026-01-01T00:00:00.000Z");

function executor() {
  return { execute: vi.fn(async (_query: unknown) => undefined) };
}

test("hasDuplicateValues detects repeated identifiers", () => {
  assert.equal(hasDuplicateValues([]), false);
  assert.equal(hasDuplicateValues(["one", "two"]), false);
  assert.equal(hasDuplicateValues(["one", "two", "one"]), true);
});

test("position updates skip empty identifier lists", async () => {
  const sqlExecutor = executor();

  await updateDatabasePropertyPositions(
    sqlExecutor,
    "database-1",
    [],
    updatedAt,
  );
  await updateDatabaseRowPositions(
    sqlExecutor,
    "database-1",
    [],
    updatedAt,
  );
  await updateDatabaseRowCompatibilityPositions(
    sqlExecutor,
    "database-1",
    [],
    updatedAt,
  );
  await updateDatabaseRowPlacementPositions(
    sqlExecutor,
    "database-1",
    [],
    updatedAt,
  );

  assert.equal(sqlExecutor.execute.mock.calls.length, 0);
});

test("position updates execute one bulk statement per target", async () => {
  const sqlExecutor = executor();
  const ids = ["first", "second", "third"];

  await updateDatabasePropertyPositions(
    sqlExecutor,
    "database-1",
    ids,
    updatedAt,
  );
  await updateDatabaseRowPositions(
    sqlExecutor,
    "database-1",
    ids,
    updatedAt,
  );
  await updateDatabaseRowCompatibilityPositions(
    sqlExecutor,
    "database-1",
    ids,
    updatedAt,
  );
  await updateDatabaseRowPlacementPositions(
    sqlExecutor,
    "database-1",
    ids,
    updatedAt,
  );

  assert.equal(sqlExecutor.execute.mock.calls.length, 4);
  for (const [query] of sqlExecutor.execute.mock.calls) {
    assert.equal(typeof query, "object");
  }
});

test("incrementDatabaseRowPlacementPositions executes one range update", async () => {
  const sqlExecutor = executor();

  await incrementDatabaseRowPlacementPositions(
    sqlExecutor,
    "database-1",
    4,
    updatedAt,
  );

  assert.equal(sqlExecutor.execute.mock.calls.length, 1);
});

test("row ordering locks sources in stable order without duplicates", async () => {
  const sqlExecutor = executor();

  await lockDatabaseRowOrderingSources(sqlExecutor, ["source-z", "source-a", "source-z"]);

  assert.equal(sqlExecutor.execute.mock.calls.length, 2);
});

test("row order rebalance skips empty sources and uses one bulk update", async () => {
  const sqlExecutor = executor();

  await rebalanceDatabaseRowOrderKeys(sqlExecutor, "source-1", [], updatedAt);
  await rebalanceDatabaseRowOrderKeys(
    sqlExecutor,
    "source-1",
    ["row-1", "row-2"],
    updatedAt,
  );

  assert.equal(sqlExecutor.execute.mock.calls.length, 1);
});
