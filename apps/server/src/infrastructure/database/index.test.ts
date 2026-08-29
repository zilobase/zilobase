import assert from "node:assert/strict";
import { test } from "vitest";

import { runWithDb, runWithDbClient } from "./index";

function fakeStandaloneClient(options: { connectError?: Error } = {}) {
  const calls = { connect: 0, end: 0 };
  const databaseClient = {
    client: {
      async connect() {
        calls.connect += 1;
        if (options.connectError) throw options.connectError;
      },
      async end() {
        calls.end += 1;
      },
    },
    db: {},
    lifecycle: "standalone",
  };

  return { calls, databaseClient };
}

test("nested database execution reuses the active context", async () => {
  const { calls, databaseClient } = fakeStandaloneClient();
  const result = await runWithDb({} as never, () =>
    runWithDbClient(databaseClient as never, async () => "reused"),
  );

  assert.equal(result, "reused");
  assert.deepEqual(calls, { connect: 0, end: 0 });
});

test("standalone database execution closes after success and failure", async () => {
  const successful = fakeStandaloneClient();
  assert.equal(
    await runWithDbClient(successful.databaseClient as never, async () => "ok"),
    "ok",
  );
  assert.deepEqual(successful.calls, { connect: 1, end: 1 });

  const failing = fakeStandaloneClient();
  await assert.rejects(
    runWithDbClient(failing.databaseClient as never, async () => {
      throw new Error("query failed");
    }),
    /query failed/,
  );
  assert.deepEqual(failing.calls, { connect: 1, end: 1 });
});

test("delayed work does not reuse a database context after its scope closes", async () => {
  const first = fakeStandaloneClient();
  const second = fakeStandaloneClient();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delayed!: Promise<string>;

  await runWithDbClient(first.databaseClient as never, async () => {
    delayed = gate.then(() =>
      runWithDbClient(second.databaseClient as never, async () => "fresh"),
    );
  });

  assert.deepEqual(first.calls, { connect: 1, end: 1 });
  release();
  assert.equal(await delayed, "fresh");
  assert.deepEqual(second.calls, { connect: 1, end: 1 });
});

test("a connection failure never runs the callback", async () => {
  const failure = new Error("connection timeout");
  const { calls, databaseClient } = fakeStandaloneClient({ connectError: failure });
  let callbackCalled = false;

  await assert.rejects(
    runWithDbClient(databaseClient as never, async () => {
      callbackCalled = true;
    }),
    failure,
  );
  assert.equal(callbackCalled, false);
  assert.deepEqual(calls, { connect: 1, end: 0 });
});

test("pooled execution does not acquire a redundant connection", async () => {
  let connects = 0;
  const databaseClient = {
    client: {
      async connect() {
        connects += 1;
        return { release() {} };
      },
    },
    db: {},
    lifecycle: "pooled",
  };

  const result = await runWithDbClient(
    databaseClient as never,
    async () => "pooled",
  );

  assert.equal(result, "pooled");
  assert.equal(connects, 0);
});
