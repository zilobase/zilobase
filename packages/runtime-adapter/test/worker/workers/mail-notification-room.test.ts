import { env, evictAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import { MailNotificationRoom } from "../../../src/worker/features/mail-realtime/mail-notification-room";

afterEach(() => evictAllDurableObjects({ webSockets: "close" }));

const CLAIMS_HEADER = "x-zilobase-mail-realtime-claims";

async function connect(connectionId: string) {
  const stub = env.MAIL_NOTIFICATION_ROOM.getByName("user-1");
  const response = await stub.fetch(
    `https://example.com/mail-realtime?connection=${connectionId}`,
    {
      headers: {
        [CLAIMS_HEADER]: encodeURIComponent(JSON.stringify({
          connectionId,
          exp: Date.now() + 60_000,
          userId: "user-1",
        })),
        Upgrade: "websocket",
      },
    },
  );
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket upgrade");
  const ready = nextMessage(socket);
  socket.accept();
  expect(JSON.parse(await ready)).toEqual({ type: "mail.ready" });
  return { socket, stub };
}

describe("MailNotificationRoom in the Workers runtime", () => {
  it("fans out metadata-only mailbox invalidations", async () => {
    const first = await connect("connection-1");
    const second = await connect("connection-1");
    const firstMessage = nextMessage(first.socket);
    const secondMessage = nextMessage(second.socket);

    await first.stub.publishNotification({
      connectionId: "connection-1",
      revision: 12,
      userId: "user-1",
    });

    const expected = {
      connectionId: "connection-1",
      revision: 12,
      type: "mail.invalidate",
    };
    expect(JSON.parse(await firstMessage)).toEqual(expected);
    expect(JSON.parse(await secondMessage)).toEqual(expected);
  });

  it("rejects malformed notification events", async () => {
    const stub = env.MAIL_NOTIFICATION_ROOM.getByName("user-1");
    await runInDurableObject(stub, async (instance: MailNotificationRoom) => {
      expect(() => instance.publishNotification({
        connectionId: "connection-1",
        revision: -1,
        userId: "user-1",
      })).toThrow("Invalid mail notification event");
    });
  });
});

function nextMessage(socket: WebSocket) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for mail realtime message")), 2_000);
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      resolve(String(event.data));
    }, { once: true });
  });
}
