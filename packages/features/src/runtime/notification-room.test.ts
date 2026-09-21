import assert from "node:assert/strict";
import test from "node:test";
import { createFakePorts, FakeRoomHost } from "@zilobase/runtime-ports/testing";
import { createNotificationRoom, type ExpiringRoomAttachment } from "./notification-room";

type Claims = { exp: number; workspaceId: string };
type Event = { type: "invalidate"; workspaceId: string };

test("notification room shares ping, expiry, and recipient behavior", async () => {
  const host = new FakeRoomHost<ExpiringRoomAttachment<Claims>>();
  const room = createNotificationRoom<Claims, Event>("navigation", {
    host,
    telemetry: createFakePorts().telemetry,
  }, {
    encode: (event) => JSON.stringify(event),
    errorReason: "socket error",
    expiredReason: "ticket expired",
    matches: (claims, event) => claims.workspaceId === event.workspaceId,
    ping: "ping",
    pong: "pong",
    validate: (value): value is Event => Boolean(value && typeof value === "object" &&
      (value as Event).type === "invalidate"),
  });
  await room.controller.start();
  const active = host.connect("active");
  active.setAttachment({ claims: { exp: Date.now() + 1_000, workspaceId: "one" } });
  const expired = host.connect("expired");
  expired.setAttachment({ claims: { exp: Date.now() - 1, workspaceId: "one" } });

  await host.receive(active, "ping");
  room.publish({ type: "invalidate", workspaceId: "one" });

  assert.deepEqual(host.sent.map(({ payload, peerId }) => ({ payload, peerId })), [
    { payload: "pong", peerId: "active" },
    { payload: JSON.stringify({ type: "invalidate", workspaceId: "one" }), peerId: "active" },
  ]);
  assert.deepEqual(host.closed, [{ code: 1008, peerId: "expired", reason: "ticket expired" }]);
});
