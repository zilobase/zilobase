import {
  env,
  evictAllDurableObjects,
  evictDurableObject,
  runInDurableObject,
} from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { writeAuthentication } from "@hocuspocus/common";
import { MessageType } from "@hocuspocus/server";
import {
  createEncoder,
  toUint8Array,
  writeVarString,
  writeVarUint,
} from "lib0/encoding";

import { PageCollaborationRoom } from "../../../src/worker/features/collaboration/page-collaboration-room";

afterEach(() => evictAllDurableObjects({ webSockets: "close" }));

async function connect(stub: DurableObjectStub<PageCollaborationRoom>) {
  const response = await stub.fetch(
    "https://example.com/collaboration?document=page:page-1",
    { headers: { Upgrade: "websocket" } },
  );
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket upgrade");
  socket.accept();
  return socket;
}

function nextClose(socket: WebSocket) {
  return new Promise<CloseEvent>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for WebSocket close")),
      2_000,
    );
    socket.addEventListener("close", (event) => {
      clearTimeout(timeout);
      resolve(event);
    }, { once: true });
  });
}

function authenticationMessage(documentName: string) {
  const encoder = createEncoder();
  writeVarString(encoder, documentName);
  writeVarUint(encoder, MessageType.Auth);
  writeAuthentication(encoder, "test-ticket");
  return toUint8Array(encoder);
}

describe("PageCollaborationRoom in the Workers runtime", () => {
  it("preserves socket attachments across hibernation", async () => {
    const stub = env.PAGE_COLLABORATION.getByName("page:page-1");
    const socket = await connect(stub);

    await evictDurableObject(stub);

    await runInDurableObject(stub, (_instance, state) => {
      const sockets = state.getWebSockets();
      expect(sockets).toHaveLength(1);
      expect(sockets[0].deserializeAttachment()).toMatchObject({
        documentName: "page:page-1",
      });
    });
    socket.close(1000, "done");
  });

  it("flushes the page document before releasing a closing socket", async () => {
    const stub = env.PAGE_COLLABORATION.getByName("page:close-flush");
    const socket = await stub.fetch(
      "https://example.com/collaboration?document=page:close-flush",
      { headers: { Upgrade: "websocket" } },
    ).then((response) => {
      if (!response.webSocket) throw new Error("Expected a WebSocket upgrade");
      response.webSocket.accept();
      return response.webSocket;
    });

    socket.send(authenticationMessage("page:close-flush"));
    await new Promise((resolve) => setTimeout(resolve, 25));
    socket.close(1000, "reload");

    await expect.poll(
      () => runInDurableObject(stub, (instance: PageCollaborationRoom) => {
        const room = instance as unknown as {
          hocuspocus: {
            runtimePortChecks: number;
            storeDocumentCalls: number;
          };
        };
        return {
          runtimePortChecks: room.hocuspocus.runtimePortChecks,
          storeDocumentCalls: room.hocuspocus.storeDocumentCalls,
        };
      }),
    ).toEqual({ runtimePortChecks: 1, storeDocumentCalls: 1 });
  });

  it("closes a socket that misses its authentication refresh grace period", async () => {
    const stub = env.PAGE_COLLABORATION.getByName("page:refresh-timeout");
    const socket = await stub.fetch(
      "https://example.com/collaboration?document=page:refresh-timeout",
      { headers: { Upgrade: "websocket" } },
    ).then((response) => {
      if (!response.webSocket) throw new Error("Expected a WebSocket upgrade");
      response.webSocket.accept();
      return response.webSocket;
    });
    const closed = nextClose(socket);

    await runInDurableObject(stub, async (instance: PageCollaborationRoom, state) => {
      const [server] = state.getWebSockets();
      const attachment = server.deserializeAttachment() as Record<
        string,
        unknown
      >;
      server.serializeAttachment({
        ...attachment,
        authMessage: new Uint8Array([1]).buffer,
        messageAddress: "page:refresh-timeout",
        tokenExpiresAt: Date.now() + 30_000,
        tokenRefreshRequestedAt: Date.now() - 30_001,
      });
      await instance.alarm();
    });

    expect(await closed).toMatchObject({ code: 1008 });
  });
});
