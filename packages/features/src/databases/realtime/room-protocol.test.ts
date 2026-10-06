import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeDatabaseMessageAllowance,
  isDatabasePresence,
  scopeDatabaseRealtimeMessage,
  toDatabaseCollaborator,
  validateDatabaseRealtimeMessage,
} from "./room-protocol";
import { databaseMutationEventV2Fixture } from "../core/fixtures";

test("mutation delivery requires proof for every represented source lane", () => {
  const event = {
    ...databaseMutationEventV2Fixture,
    changes: { ...databaseMutationEventV2Fixture.changes, sourceVersions: { "fixture-source": 7 } },
  };
  assert.deepEqual(scopeDatabaseRealtimeMessage(event, ["fixture-source"]), event);
  const restricted = scopeDatabaseRealtimeMessage(event, []);
  assert.deepEqual(restricted, { ...event, dataSourceId: null, changes: {}, requiresReset: true });
  assert(!JSON.stringify(restricted).includes("fixture-source"));
  assert(!JSON.stringify(restricted).includes("fixture-row"));
  const hiddenLane = { ...event, changes: { sourceVersions: { secret: 99 } } };
  assert.deepEqual(scopeDatabaseRealtimeMessage(hiddenLane, ["fixture-source"]), {
    ...hiddenLane,
    dataSourceId: null,
    changes: {},
    requiresReset: true,
  });
  assert.deepEqual(scopeDatabaseRealtimeMessage({ type: "presence.clear" }, []), {
    type: "presence.clear",
  });
});

test("database realtime protocol is runtime-neutral", () => {
  assert.equal(validateDatabaseRealtimeMessage(JSON.stringify({ type: "realtime.ping" })).ok, true);
  assert.deepEqual(validateDatabaseRealtimeMessage(new ArrayBuffer(1)), {
    code: 1003,
    ok: false,
    reason: "JSON messages are required",
  });
  assert.equal(isDatabasePresence({ columnKey: "title", rowId: "row", viewId: null }), true);
  assert.equal(isDatabasePresence({ columnKey: "", rowId: "row", viewId: null }), false);
  assert.equal(
    toDatabaseCollaborator({
      claims: { sessionId: "session", user: { id: "user" } },
      connectedAt: 0,
      presence: { columnKey: "title", rowId: "row", viewId: null },
      updatedAt: 1,
    }).sessionId,
    "session",
  );
});

test("database realtime message allowance has one shared fixed-window rule", () => {
  const peer = {};
  const rates = new WeakMap<object, { count: number; startedAt: number }>();
  for (let index = 0; index < 30; index += 1) {
    assert.equal(consumeDatabaseMessageAllowance(peer, rates, 0), true);
  }
  assert.equal(consumeDatabaseMessageAllowance(peer, rates, 0), false);
  assert.equal(consumeDatabaseMessageAllowance(peer, rates, 1_000), true);
});
