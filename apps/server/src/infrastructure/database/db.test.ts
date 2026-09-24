import assert from "node:assert/strict";
import { test } from "vitest";

import { createAppRuntime } from "../effect";
import { runWithDb } from "./index";
import { DatabaseUnavailable, Db } from "./db";

test("Db.withEnv reuses an active database context", async () => {
  const runtime = createAppRuntime(Db.layer);
  try {
    const result = await runWithDb({} as never, () =>
      runtime.runPromise(Db.use((database) => database.withEnv({}, async () => "ok"))),
    );
    assert.equal(result, "ok");
  } finally {
    await runtime.dispose();
  }
});

test("Db.withEnv maps connection failures to DatabaseUnavailable", async () => {
  const runtime = createAppRuntime(Db.layer);
  try {
    await assert.rejects(
      () => runtime.runPromise(Db.use((database) => database.withEnv({}, async () => "ok"))),
      (error: unknown) => error instanceof DatabaseUnavailable,
    );
  } finally {
    await runtime.dispose();
  }
});
