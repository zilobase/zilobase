import {
  env,
  evictAllDurableObjects,
  evictDurableObject,
  runInDurableObject,
} from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseMutationEventV2 } from "@zilobase/features/databases";
import { DatabaseCollaborationRoom } from "../../../src/worker/features/database-realtime/database-collaboration-room";

afterEach(() => evictAllDurableObjects({ webSockets: "close" }));

const CLAIMS_HEADER = "x-zilobase-database-realtime-claims";

function databaseClaims(
  databaseId: string,
  expiresAt: number,
  sessionId: string,
  version = 0,
) {
  return {
    canEdit: true,
    databaseId,
    exp: expiresAt,
    sessionId,
    user: { id: `user-${sessionId}`, name: `User ${sessionId}` },
    version,
    workspaceId: "workspace-1",
  };
}

async function connect(
  stub: DurableObjectStub<DatabaseCollaborationRoom>,
  databaseId: string,
  expiresAt: number,
  sessionId: string,
  version = 0,
) {
  const response = await stub.fetch(
    `https://example.com/database-collaboration?database=${databaseId}`,
    {
      headers: {
        [CLAIMS_HEADER]: encodeURIComponent(
          JSON.stringify(databaseClaims(databaseId, expiresAt, sessionId, version)),
        ),
        Upgrade: "websocket",
      },
    },
  );
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket upgrade");
  const ready = nextMessage(socket);
  socket.accept();
  expect(JSON.parse(await ready)).toMatchObject({
    databaseVersion: version,
    databaseId,
    protocolVersion: 2,
    sessionId,
    type: "realtime.ready",
  });
  return socket;
}

function nextMessage(socket: WebSocket) {
  return nextSocketEvent<MessageEvent>(socket, "message").then((event) =>
    String(event.data)
  );
}

function nextSocketEvent<T extends Event>(socket: WebSocket, type: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for WebSocket ${type}`)),
      2_000,
    );
    socket.addEventListener(type, (event) => {
      clearTimeout(timeout);
      resolve(event as T);
    }, { once: true });
  });
}

function mutationV2(version: number): DatabaseMutationEventV2 {
  return {
    actorId: "user-1",
    areas: ["records"],
    changes: { removedRecordIds: [`row-${version}`] },
    commandId: `command-${version}`,
    committedAt: "2026-08-01T00:00:00.000Z",
    databaseId: "database-1",
    dataSourceId: "source-1",
    eventId: `event-${version}`,
    protocolVersion: 2,
    type: "database.mutation",
    version,
  };
}

describe("DatabaseCollaborationRoom in the Workers runtime", () => {
  it("persists the newest mutation version and ignores stale delivery", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-1");

    await stub.publishMutation(mutationV2(2));
    await stub.publishMutation(mutationV2(1));

    await runInDurableObject(
      stub,
      async (instance: DatabaseCollaborationRoom, state) => {
        expect(instance).toBeInstanceOf(DatabaseCollaborationRoom);
        await expect(state.storage.get("lastPublishedVersion")).resolves.toBe(2);
      },
    );
  });

  it("rejects protocol v1 without changing the ordered version cursor", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-v2");

    await stub.publishMutation({ ...mutationV2(4), databaseId: "database-v2" });
    await runInDurableObject(stub, async (instance: DatabaseCollaborationRoom) => {
      await expect(instance.publishMutation({
        actorId: "user-1",
        changed: ["rows"],
        committedAt: "2026-08-01T00:00:00.000Z",
        databaseId: "database-v2",
        delta: {},
        mutationId: "legacy-event",
        protocolVersion: 1,
        type: "database.mutation",
        version: 5,
      } as never)).rejects.toThrow("Invalid database mutation event");
    });

    await runInDurableObject(stub, async (_instance, state) => {
      await expect(state.storage.get("lastPublishedVersion")).resolves.toBe(4);
    });
  });

  it("broadcasts one v2 event to every live client and ignores duplicate delivery", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-v2-clients");
    const expiresAt = Date.now() + 60_000;
    const first = await connect(
      stub,
      "database-v2-clients",
      expiresAt,
      "session-1",
    );
    const second = await connect(
      stub,
      "database-v2-clients",
      expiresAt,
      "session-2",
    );
    const firstMessage = nextMessage(first);
    const secondMessage = nextMessage(second);
    const event = {
      ...mutationV2(8),
      databaseId: "database-v2-clients",
    };

    await stub.publishMutation(event);
    expect(JSON.parse(await firstMessage)).toEqual(event);
    expect(JSON.parse(await secondMessage)).toEqual(event);

    await stub.publishMutation({ ...event, eventId: "duplicate-event" });
    await runInDurableObject(stub, async (_instance, state) => {
      await expect(state.storage.get("lastPublishedVersion")).resolves.toBe(8);
    });
  });

  it("does not treat a connection ticket watermark as already published", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-delayed-event");
    const socket = await connect(
      stub,
      "database-delayed-event",
      Date.now() + 60_000,
      "session-1",
      8,
    );
    const delivered = nextMessage(socket);
    const event = {
      ...mutationV2(7),
      databaseId: "database-delayed-event",
    };

    await stub.publishMutation(event);
    expect(JSON.parse(await delivered)).toEqual(event);
    socket.close(1000, "done");
  });

  it("rejects malformed mutation events", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-2");

    await runInDurableObject(stub, async (instance: DatabaseCollaborationRoom) => {
      await expect(
        instance.publishMutation({ ...mutationV2(1), version: 0 }),
      ).rejects.toThrow("Invalid database mutation event");
    });
  });

  it("restores serialized presence after hibernation", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-hibernation");
    const expiresAt = Date.now() + 60_000;
    const first = await connect(
      stub,
      "database-hibernation",
      expiresAt,
      "session-1",
    );
    const second = await connect(
      stub,
      "database-hibernation",
      expiresAt,
      "session-2",
    );

    const initialPresence = nextMessage(second);
    first.send(JSON.stringify({
      presence: { columnKey: "name", rowId: "row-1", viewId: null },
      type: "presence.update",
    }));
    expect(JSON.parse(await initialPresence)).toMatchObject({
      collaborator: { sessionId: "session-1" },
      type: "presence.update",
    });

    await evictDurableObject(stub);

    const restoredPresence = nextMessage(second);
    first.send(JSON.stringify({
      presence: { columnKey: "status", rowId: "row-2", viewId: "view-1" },
      type: "presence.update",
    }));
    expect(JSON.parse(await restoredPresence)).toMatchObject({
      collaborator: {
        presence: { columnKey: "status", rowId: "row-2", viewId: "view-1" },
        sessionId: "session-1",
      },
      type: "presence.update",
    });

    first.close(1000, "done");
    second.close(1000, "done");
  });

  it("auto-responds to heartbeat pings after hibernation and keeps the room usable", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-heartbeat");
    const expiresAt = Date.now() + 60_000;
    const first = await connect(
      stub,
      "database-heartbeat",
      expiresAt,
      "session-1",
    );
    const second = await connect(
      stub,
      "database-heartbeat",
      expiresAt,
      "session-2",
    );

    await evictDurableObject(stub);

    const pong = nextMessage(first);
    first.send(JSON.stringify({ type: "realtime.ping" }));
    expect(JSON.parse(await pong)).toEqual({ type: "realtime.pong" });

    const presence = nextMessage(second);
    first.send(JSON.stringify({
      presence: { columnKey: "name", rowId: "row-1", viewId: null },
      type: "presence.update",
    }));
    expect(JSON.parse(await presence)).toMatchObject({
      collaborator: { sessionId: "session-1" },
      type: "presence.update",
    });

    first.close(1000, "done");
    second.close(1000, "done");
  });

  it("closes idle sockets when their credentials expire", async () => {
    const stub = env.DATABASE_COLLABORATION.getByName("database-expiration");
    const socket = await connect(
      stub,
      "database-expiration",
      Date.now() + 20,
      "session-expiring",
    );
    const closed = nextSocketEvent<CloseEvent>(socket, "close");

    await runInDurableObject(stub, async (_instance, state) => {
      await expect(state.storage.getAlarm()).resolves.toBeTypeOf("number");
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    await runInDurableObject(
      stub,
      async (instance: DatabaseCollaborationRoom) => instance.alarm(),
    );
    expect(await closed).toMatchObject({ code: 1008 });
  });
});
