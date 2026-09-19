import { env, evictAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import { CalendarNotificationRoom } from "../../../src/worker/features/calendar-realtime/calendar-notification-room";

afterEach(() => evictAllDurableObjects({ webSockets: "close" }));

const CLAIMS_HEADER = "x-zilobase-calendar-realtime-claims";

async function connect(bindingId: string) {
  const stub = env.CALENDAR_NOTIFICATION_ROOM.getByName("user-1");
  const response = await stub.fetch(
    `https://example.com/calendar-realtime?binding=${bindingId}`,
    {
      headers: {
        [CLAIMS_HEADER]: encodeURIComponent(JSON.stringify({
          bindingId,
          workspaceId: "workspace-1",
          exp: Date.now() + 60_000,
          userId: "user-1", accountId: "account-1",
        })),
        Upgrade: "websocket",
      },
    },
  );
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket upgrade");
  const ready = nextMessage(socket);
  socket.accept();
  expect(JSON.parse(await ready)).toEqual({ type: "calendar.ready" });
  return { socket, stub };
}

describe("CalendarNotificationRoom in the Workers runtime", () => {
  it("fans out metadata-only calendar invalidations", async () => {
    const first = await connect("connection-1");
    const second = await connect("connection-1");
    const firstMessage = nextMessage(first.socket);
    const secondMessage = nextMessage(second.socket);

    await first.stub.publishNotification({
      bindingId: "connection-1",
      calendarId: "primary", generation: 1, workspaceId: "workspace-1",
      revision: 12,
      userId: "user-1", accountId: "account-1",
    });

    const expected = {
      bindingId: "connection-1",
      calendarId: "primary", generation: 1, workspaceId: "workspace-1",
      revision: 12,
      type: "calendar.invalidate",
    };
    expect(JSON.parse(await firstMessage)).toEqual(expected);
    expect(JSON.parse(await secondMessage)).toEqual(expected);
  });

  it("answers heartbeats and isolates workspace invalidations", async () => {
    const first = await connect("connection-1");
    const response = nextMessage(first.socket);
    first.socket.send(JSON.stringify({ type: "calendar.ping" }));
    expect(JSON.parse(await response)).toEqual({ type: "calendar.pong" });
    const messages: string[] = [];
    first.socket.addEventListener("message", event => messages.push(String(event.data)));
    await first.stub.publishNotification({ bindingId: "connection-1", accountId: "account-1", userId: "user-1", workspaceId: "other", calendarId: "primary", revision: 2, generation: 1 });
    const pong = nextMessage(first.socket); first.socket.send(JSON.stringify({ type: "calendar.ping" })); await pong;
    expect(messages.map(value => JSON.parse(value).type)).not.toContain("calendar.invalidate");
  });

  it("rejects malformed notification events", async () => {
    const stub = env.CALENDAR_NOTIFICATION_ROOM.getByName("user-1");
    await runInDurableObject(stub, async (instance: CalendarNotificationRoom) => {
      expect(() => instance.publishNotification({
        bindingId: "connection-1",
        calendarId: "primary", generation: 1, workspaceId: "workspace-1",
      revision: -1,
        userId: "user-1", accountId: "account-1",
      })).toThrow("Invalid calendar notification event");
    });
  });
});

function nextMessage(socket: WebSocket) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for calendar realtime message")), 2_000);
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      resolve(String(event.data));
    }, { once: true });
  });
}
