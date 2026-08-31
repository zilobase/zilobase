import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test } from "vitest";

import {
  createNavigationRealtimeTicket,
  NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX,
  NAVIGATION_REALTIME_PROTOCOL,
} from "../../shared/security/navigation-realtime-ticket";
import { attachNodeNavigationRealtimeRuntime } from "./navigation-realtime-runtime";

const env = { COLLABORATION_SECRET: "navigation-realtime-test-secret" };

test("navigation realtime rejects missing and mismatched workspace tickets", async () => {
  const fixture = await startFixture("workspace-1");
  try {
    const missing = new WebSocket(fixture.url);
    await assert.rejects(waitForOpen(missing), /WebSocket/);
    missing.close();

    const mismatched = new WebSocket(
      fixture.url,
      protocols(await createTicket("workspace-2")),
    );
    await assert.rejects(waitForOpen(mismatched), /WebSocket/);
    mismatched.close();
  } finally {
    await fixture.close();
  }
});

test("navigation realtime broadcasts generic invalidations only within a workspace", async () => {
  const first = await startFixture("workspace-1");
  const second = await startFixture("workspace-2");
  const workspaceOne = new NavigationClient(first.url, await createTicket("workspace-1"));
  const workspaceTwo = new NavigationClient(second.url, await createTicket("workspace-2"));

  try {
    await Promise.all([workspaceOne.opened, workspaceTwo.opened]);
    await Promise.all([workspaceOne.next("navigation.ready"), workspaceTwo.next("navigation.ready")]);
    const event = {
      committedAt: "2026-09-01T00:00:00.000Z",
      eventId: "event-1",
      protocolVersion: 1 as const,
      type: "navigation.invalidate" as const,
      workspaceId: "workspace-1",
    };
    await first.runtime.publish(event);
    assert.deepEqual(await workspaceOne.next("navigation.invalidate"), event);
    await assert.rejects(workspaceTwo.next("navigation.invalidate", 100), /Timed out/);
  } finally {
    workspaceOne.close();
    workspaceTwo.close();
    await Promise.all([first.close(), second.close()]);
  }
});

async function startFixture(workspaceId: string) {
  const server = createServer((_request, response) => response.end());
  const runtime = attachNodeNavigationRealtimeRuntime(server, env);
  await listen(server);
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    close: async () => {
      await runtime.destroy();
      await closeServer(server);
    },
    runtime,
    url: `ws://127.0.0.1:${address.port}/navigation-realtime?workspace=${workspaceId}`,
  };
}

class NavigationClient {
  readonly opened: Promise<void>;
  readonly websocket: WebSocket;
  private readonly messages: Array<Record<string, unknown>> = [];
  private readonly waiters = new Set<{
    resolve: (message: Record<string, unknown>) => void;
    type: string;
  }>();

  constructor(url: string, ticket: string) {
    this.websocket = new WebSocket(url, protocols(ticket));
    this.opened = waitForOpen(this.websocket);
    this.websocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>;
      const waiter = [...this.waiters].find(({ type }) => type === message.type);
      if (waiter) {
        this.waiters.delete(waiter);
        waiter.resolve(message);
      } else this.messages.push(message);
    });
  }

  close() { this.websocket.close(); }

  next(type: string, timeout = 1_000) {
    const existing = this.messages.findIndex((message) => message.type === type);
    if (existing >= 0) return Promise.resolve(this.messages.splice(existing, 1)[0]!);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const waiter = { resolve, type };
      this.waiters.add(waiter);
      setTimeout(() => {
        if (this.waiters.delete(waiter)) reject(new Error(`Timed out waiting for ${type}`));
      }, timeout);
    });
  }
}

function createTicket(workspaceId: string) {
  return createNavigationRealtimeTicket(
    { userId: "user-1", workspaceId },
    env,
  ).then(({ token }) => token);
}

function protocols(ticket: string) {
  return [
    NAVIGATION_REALTIME_PROTOCOL,
    `${NAVIGATION_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket}`,
  ];
}

function waitForOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket upgrade failed")), { once: true });
  });
}

function listen(server: Server) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
