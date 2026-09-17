import assert from "node:assert/strict";
import test from "node:test";

import type { ApiFetcher } from "../../shared/api-fetcher";
import {
  DatabaseCommandUnconfirmedError,
  OfflineError,
  executeDatabaseCommand,
} from "./execute";
import { clearPendingStateForTests } from "./pending";

function ackFor(commandId: string, overrides: Record<string, unknown> = {}) {
  return {
    commandId,
    event: {
      actorId: "user-1",
      areas: ["records"],
      changes: {},
      commandId,
      committedAt: "2026-09-08T00:00:00.000Z",
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      eventId: `event-${commandId}`,
      protocolVersion: 2,
      type: "database.mutation",
      version: 1,
      ...overrides,
    },
    result: {},
  };
}

test("offline throws OfflineError without POST", async () => {
  clearPendingStateForTests();
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: false },
  });
  try {
    let posted = false;
    const apiFetch = (async () => {
      posted = true;
      return {};
    }) as ApiFetcher;
    await assert.rejects(
      () =>
        executeDatabaseCommand(apiFetch, {
          command: { propertyId: "p", rowId: "r", type: "cell.set", value: 1 },
          databaseId: "database-1",
          dataSourceId: "data-source-1",
        }),
      OfflineError,
    );
    assert.equal(posted, false);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
    clearPendingStateForTests();
  }
});

test("retry-once uses SAME commandId and SAME body on network failure", async () => {
  clearPendingStateForTests();
  const bodies: string[] = [];
  let calls = 0;
  const apiFetch = (async (_path: string, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body));
    if (calls === 1) throw new TypeError("network down");
    const request = JSON.parse(bodies[0]!) as { commandId: string };
    return ackFor(request.commandId);
  }) as ApiFetcher;
  const ack = await executeDatabaseCommand(apiFetch, {
    command: { propertyId: "p", rowId: "r", type: "cell.set", value: 1 },
    databaseId: "database-1",
    dataSourceId: "data-source-1",
  });
  assert.equal(calls, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(ack.commandId, ack.event.commandId);
  clearPendingStateForTests();
});

test("second retry failure becomes Unconfirmed", async () => {
  clearPendingStateForTests();
  const apiFetch = (async () => {
    throw new TypeError("network down");
  }) as ApiFetcher;
  await assert.rejects(
    () =>
      executeDatabaseCommand(apiFetch, {
        command: { propertyId: "p", rowId: "r", type: "cell.set", value: 1 },
        databaseId: "database-1",
        dataSourceId: "data-source-1",
      }),
    DatabaseCommandUnconfirmedError,
  );
  clearPendingStateForTests();
});

test("409 COMMAND_ID_REUSED and ROW_MOVE_CONFLICT do NOT retry", async () => {
  clearPendingStateForTests();
  for (
    const body of [
      { code: "COMMAND_ID_REUSED", commandId: "x" },
      { code: "ROW_MOVE_CONFLICT", rowId: "r" },
    ]
  ) {
    let calls = 0;
    const apiFetch = (async () => {
      calls += 1;
      throw { body, status: 409 };
    }) as ApiFetcher;
    await assert.rejects(() =>
      executeDatabaseCommand(apiFetch, {
        command: { propertyId: "p", rowId: "r", type: "cell.set", value: 1 },
        databaseId: "database-1",
        dataSourceId: "data-source-1",
      })
    );
    assert.equal(calls, 1);
  }
  clearPendingStateForTests();
});

test("ack id and scope mismatch become Unconfirmed", async () => {
  clearPendingStateForTests();
  const mismatched = (async () => ({ commandId: "other", event: { commandId: "other" } })) as ApiFetcher;
  await assert.rejects(
    () =>
      executeDatabaseCommand(mismatched, {
        command: { propertyId: "p", rowId: "r", type: "cell.set", value: 1 },
        databaseId: "database-1",
        dataSourceId: "data-source-1",
      }),
    DatabaseCommandUnconfirmedError,
  );

  const scopeMismatch = (async (_path: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { commandId: string };
    return ackFor(request.commandId, { databaseId: "other-db" });
  }) as ApiFetcher;
  await assert.rejects(
    () =>
      executeDatabaseCommand(scopeMismatch, {
        command: { propertyId: "p", rowId: "r", type: "cell.set", value: 1 },
        databaseId: "database-1",
        dataSourceId: "data-source-1",
      }),
    DatabaseCommandUnconfirmedError,
  );
  clearPendingStateForTests();
});
