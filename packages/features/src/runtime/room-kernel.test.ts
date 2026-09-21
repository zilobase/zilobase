import assert from "node:assert/strict";
import test from "node:test";
import { createFakePorts } from "@zilobase/runtime-ports/testing";
import { createRoomController } from "./room-kernel";

test("room controller wires one neutral handler suite to the host", async () => {
  const ports = createFakePorts();
  const received: unknown[] = [];
  const controller = createRoomController("room-1", ports, {
    message: (_peer, message) => { received.push(message); },
    invoke: ({ payload }) => payload,
  });

  await controller.start();
  const peer = ports.host.connect("peer-1", new Request("https://example.test"));
  await ports.host.receive(peer, "hello");
  assert.deepEqual(received, ["hello"]);
  assert.equal(await controller.invoke({ payload: 42, type: "read" }), 42);
  await controller.close();
  await ports.host.receive(peer, "ignored");
  assert.deepEqual(received, ["hello"]);
});
