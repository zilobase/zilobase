import assert from "node:assert/strict";
import test from "node:test";
import { FakeRoomHost, FakeRoomState, createFakePorts } from "./testing";

test("fake ports expose deterministic state, fanout, and jobs", async () => {
  const ports = createFakePorts({ env: { VALUE: "configured" } });
  const state = new FakeRoomState();
  await state.put("room:item", { value: 1 });
  await state.setAlarm(42);
  assert.deepEqual([...await state.list({ prefix: "room:" })], [["room:item", { value: 1 }]]);
  assert.equal(await state.getAlarm(), 42);

  const received: unknown[] = [];
  await ports.fanout.subscribe("channel", (payload) => { received.push(payload); });
  await ports.fanout.publish("channel", { ok: true });
  await ports.jobs.dispatch([{ availableAt: "2026-01-01T00:00:00.000Z", cellId: "default", kind: "test", resourceId: "1", version: 1 }]);
  assert.deepEqual(received, [{ ok: true }]);
  assert.equal(ports.dispatched.length, 1);
  assert.equal(ports.env.require("VALUE"), "configured");
});

test("fake room host delivers and broadcasts messages", async () => {
  const host = new FakeRoomHost();
  const first = host.connect("first");
  host.connect("second");
  const received: unknown[] = [];
  host.onMessage((_peer, message) => { received.push(message); });
  await host.receive(first, "hello");
  host.broadcast("ready", { except: first });
  assert.deepEqual(received, ["hello"]);
  assert.deepEqual(host.sent, [{ payload: "ready", peerId: "second" }]);
});
