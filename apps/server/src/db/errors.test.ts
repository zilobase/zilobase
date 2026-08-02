import assert from "node:assert/strict";
import { test } from "vitest";

import {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "./errors";

test("recognizes PostgreSQL and nested Hyperdrive availability failures", () => {
  const postgresError = Object.assign(new Error("too many connections"), {
    code: "53300",
  });
  const hyperdriveError = new Error("query failed", {
    cause: new Error("Failed to acquire a connection from the pool."),
  });

  assert.equal(isDatabaseUnavailableError(postgresError), true);
  assert.equal(isDatabaseUnavailableError(hyperdriveError), true);
  assert.equal(getDatabaseErrorCode(postgresError), "53300");
  assert.equal(DATABASE_UNAVAILABLE_CODE, "DATABASE_UNAVAILABLE");
  assert.equal(
    DATABASE_UNAVAILABLE_MESSAGE,
    "The database is temporarily unavailable.",
  );
});

test("does not hide ordinary application errors", () => {
  assert.equal(isDatabaseUnavailableError(new Error("Database not found")), false);
  assert.equal(isDatabaseUnavailableError({ code: "23505" }), false);
  assert.equal(isDatabaseUnavailableError(null), false);

  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  assert.equal(isDatabaseUnavailableError(cyclic), false);
  assert.equal(getDatabaseErrorCode({ cause: { code: "08006" } }), "08006");
  assert.equal(getDatabaseErrorCode(cyclic), null);
  assert.equal(getDatabaseErrorCode("not an error"), null);
});
