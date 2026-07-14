import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { createServer, type Server } from "node:http";
import test from "node:test";

import {
  createDatabaseRealtimeTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
} from "../database-realtime-ticket";
import { attachNodeDatabaseRealtimeRuntime } from "./node-runtime";

const env = { BETTER_AUTH_SECRET: "database-realtime-test-secret" };

test("serverful database realtime rejects upgrades without a ticket", async () => {
  const fixture = await startFixture();

  try {
    assert.equal(await requestUpgradeStatus(fixture.url), 401);
  } finally {
    await fixture.close();
  }
});

test("serverful database rooms broadcast presence and versioned mutations", async () => {
  const fixture = await startFixture();
  const firstTicket = await createTicket("user-1", 3);
  const secondTicket = await createTicket("user-2", 3);
  const first = new RealtimeClient(fixture.url, firstTicket.token);
  const second = new RealtimeClient(fixture.url, secondTicket.token);

  try {
    await Promise.all([first.opened, second.opened]);
    const [firstReady, secondReady] = await Promise.all([
      first.next("realtime.ready"),
      second.next("realtime.ready"),
    ]);

    assert.equal(firstReady.version, 3);
    assert.equal(secondReady.version, 3);
    assert.equal(first.websocket.protocol, DATABASE_REALTIME_PROTOCOL);

    first.send({
      presence: { columnKey: "status", rowId: "row-1", viewId: null },
      type: "presence.update",
    });

    const presence = await second.next("presence.update");
    assert.equal(presence.collaborator.sessionId, firstTicket.sessionId);
    assert.deepEqual(presence.collaborator.presence, {
      columnKey: "status",
      rowId: "row-1",
      viewId: null,
    });

    await fixture.runtime.publishMutation({
      actorId: "user-1",
      changed: ["values"],
      committedAt: new Date().toISOString(),
      databaseId: "database-1",
      delta: {},
      mutationId: "mutation-1",
      protocolVersion: 1,
      type: "database.mutation",
      version: 4,
    });

    const [firstMutation, secondMutation] = await Promise.all([
      first.next("database.mutation"),
      second.next("database.mutation"),
    ]);
    assert.equal(firstMutation.version, 4);
    assert.equal(secondMutation.version, 4);

    first.websocket.close();
    const cleared = await second.next("presence.clear");
    assert.equal(cleared.sessionId, firstTicket.sessionId);
  } finally {
    first.websocket.close();
    second.websocket.close();
    await fixture.close();
  }
});

test("serverful database rooms ignore stale mutation deliveries", async () => {
  const fixture = await startFixture();
  const ticket = await createTicket("user-1", 8);
  const client = new RealtimeClient(fixture.url, ticket.token);

  try {
    await client.opened;
    await client.next("realtime.ready");
    await fixture.runtime.publishMutation({
      actorId: "user-1",
      changed: ["rows"],
      committedAt: new Date().toISOString(),
      databaseId: "database-1",
      delta: {},
      mutationId: "stale-mutation",
      protocolVersion: 1,
      type: "database.mutation",
      version: 7,
    });

    await assert.rejects(
      client.next("database.mutation", 100),
      /Timed out/,
    );
  } finally {
    client.websocket.close();
    await fixture.close();
  }
});

async function startFixture() {
  const server = createServer((_request, response) => response.end());
  const runtime = attachNodeDatabaseRealtimeRuntime(server, env);

  await listen(server);
  const address = server.address();
  assert(address && typeof address === "object");

  return {
    async close() {
      await runtime.destroy();
      await closeServer(server);
    },
    runtime,
    url: `ws://127.0.0.1:${address.port}/database-collaboration?database=database-1`,
  };
}

async function createTicket(userId: string, version: number) {
  return createDatabaseRealtimeTicket({
    canEdit: true,
    databaseId: "database-1",
    user: { id: userId, name: userId },
    version,
    workspaceId: "workspace-1",
  }, env);
}

class RealtimeClient {
  readonly websocket: WebSocket;
  readonly opened: Promise<void>;
  private readonly messages: Array<Record<string, any>> = [];
  private readonly waiters = new Set<{
    resolve: (message: Record<string, any>) => void;
    type: string;
  }>();

  constructor(url: string, token: string) {
    this.websocket = new WebSocket(url, [
      DATABASE_REALTIME_PROTOCOL,
      `${DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX}${token}`,
    ]);
    this.websocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Record<string, any>;
      const waiter = [...this.waiters].find(({ type }) => type === message.type);

      if (waiter) {
        this.waiters.delete(waiter);
        waiter.resolve(message);
      } else {
        this.messages.push(message);
      }
    });
    this.opened = new Promise((resolve, reject) => {
      this.websocket.addEventListener("open", () => resolve(), { once: true });
      this.websocket.addEventListener("error", () => {
        reject(new Error("WebSocket upgrade failed"));
      }, { once: true });
    });
  }

  next(type: string, timeoutMs = 1_000) {
    const index = this.messages.findIndex((message) => message.type === type);

    if (index >= 0) {
      return Promise.resolve(this.messages.splice(index, 1)[0]);
    }

    return new Promise<Record<string, any>>((resolve, reject) => {
      const waiter = {
        resolve: (message: Record<string, any>) => {
          clearTimeout(timeout);
          resolve(message);
        },
        type,
      };
      const timeout = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  send(message: unknown) {
    this.websocket.send(JSON.stringify(message));
  }
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function requestUpgradeStatus(value: string) {
  const url = new URL(value);

  return new Promise<number>((resolve, reject) => {
    const socket = createConnection(Number(url.port), url.hostname);
    let response = "";

    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.once("end", () => {
      const status = Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1]);

      if (!Number.isInteger(status)) {
        reject(new Error(`Invalid upgrade response: ${response}`));
        return;
      }

      resolve(status);
    });
    socket.once("connect", () => {
      socket.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"));
    });
  });
}
