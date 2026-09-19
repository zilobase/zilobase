import { env, evictAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import { NavigationNotificationRoom } from "../../../src/worker/features/navigation-realtime/navigation-notification-room";

afterEach(() => evictAllDurableObjects({ webSockets: "close" }));

const CLAIMS_HEADER = "x-zilobase-navigation-realtime-claims";

async function connect(workspaceId: string, sessionId: string) {
  const stub = env.NAVIGATION_NOTIFICATION_ROOM.getByName(workspaceId);
  const response = await stub.fetch(
    `https://example.com/navigation-realtime?workspace=${workspaceId}`,
    {
      headers: {
        [CLAIMS_HEADER]: encodeURIComponent(JSON.stringify({
          exp: Date.now() + 60_000,
          sessionId,
          userId: "user-1",
          workspaceId,
        })),
        Upgrade: "websocket",
      },
    },
  );
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket upgrade");
  const ready = nextMessage(socket);
  socket.accept();
  expect(JSON.parse(await ready)).toEqual({
    protocolVersion: 1,
    sessionId,
    type: "navigation.ready",
    workspaceId,
  });
  return { socket, stub };
}

describe("NavigationNotificationRoom in the Workers runtime", () => {
  it("fans out metadata-only workspace invalidations", async () => {
    const first = await connect("workspace-1", "session-1");
    const second = await connect("workspace-1", "session-2");
    const firstMessage = nextMessage(first.socket);
    const secondMessage = nextMessage(second.socket);
    const event = {
      committedAt: "2026-09-01T00:00:00.000Z",
      eventId: "event-1",
      protocolVersion: 1 as const,
      type: "navigation.invalidate" as const,
      workspaceId: "workspace-1",
    };

    await first.stub.publishInvalidation(event);

    expect(JSON.parse(await firstMessage)).toEqual(event);
    expect(JSON.parse(await secondMessage)).toEqual(event);
  });

  it("retains socket attachments across hibernation", async () => {
    const connection = await connect("workspace-1", "session-1");
    await evictAllDurableObjects({ webSockets: "hibernate" });
    const message = nextMessage(connection.socket);
    await connection.stub.publishInvalidation({
      committedAt: "2026-09-01T00:00:00.000Z",
      eventId: "event-after-hibernation",
      protocolVersion: 1,
      type: "navigation.invalidate",
      workspaceId: "workspace-1",
    });
    expect(JSON.parse(await message).eventId).toBe("event-after-hibernation");
  });

  it("rejects malformed invalidation events", async () => {
    const stub = env.NAVIGATION_NOTIFICATION_ROOM.getByName("workspace-1");
    await runInDurableObject(stub, async (instance: NavigationNotificationRoom) => {
      expect(() => instance.publishInvalidation({
        committedAt: "2026-09-01T00:00:00.000Z",
        eventId: "event-1",
        protocolVersion: 1,
        type: "navigation.invalidate",
        workspaceId: "",
      })).toThrow("Invalid navigation invalidation event");
      expect(() => instance.publishInvalidation({
        committedAt: "2026-09-01T00:00:00.000Z",
        eventId: "event-1",
        protocolVersion: 2,
        type: "navigation.invalidate",
        workspaceId: "workspace-1",
      } as never)).toThrow("Invalid navigation invalidation event");
    });
  });
});

function nextMessage(socket: WebSocket) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for navigation realtime message")),
      2_000,
    );
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      resolve(String(event.data));
    }, { once: true });
  });
}
