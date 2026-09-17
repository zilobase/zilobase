import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"
import type { ApiFetcher } from  "../../shared/context"

import {
  closeRealtimeSocket,
  createCellPresenceByKey,
  DATABASE_REALTIME_HEARTBEAT_MS,
  DATABASE_REALTIME_PING,
  DatabaseRealtimeManager,
  reconnectDelay,
  parseDatabaseRealtimeServerMessage,
  samePresence,
  ticketFailureAction,
  type DatabasePresenceCollaborator,
} from   "./realtime"

test("successful tickets preserve upgrade failure backoff until realtime is ready", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
  t.mock.method(Math, "random", () => 0.5)
  const previousSocket = globalThis.WebSocket
  const sockets: FakeSocket[] = []
  class FakeSocket extends EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    readyState = 0
    constructor(..._args: unknown[]) {
      super()
      sockets.push(this)
    }
    close() {
      this.readyState = 3
      this.dispatchEvent(new Event("close"))
    }
    send() {}
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket
  t.after(() => { globalThis.WebSocket = previousSocket })
  const queryClient = new QueryClient()
  t.after(() => queryClient.clear())
  const apiFetch = (async () => ({
    databaseId: "database-1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    sessionId: "session-1",
    token: "ticket",
    version: 0,
    websocketProtocols: [],
    websocketUrl: "ws://localhost/database-collaboration",
  })) as ApiFetcher
  const manager = new DatabaseRealtimeManager(queryClient, apiFetch, "database-1", null, () => {})
  const unsubscribe = manager.subscribe(() => {})
  t.after(unsubscribe)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(sockets.length, 1)

  for (const delay of [250, 500, 1_000]) {
    const count: number = sockets.length
    sockets.at(-1)!.close()
    t.mock.timers.tick(delay - 1)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(sockets.length, count)
    t.mock.timers.tick(1)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(sockets.length, count + 1)
  }

  const socket = sockets.at(-1)!
  socket.readyState = FakeSocket.OPEN
  socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({
    type: "realtime.ready", protocolVersion: 2, databaseId: "database-1",
    databaseVersion: 0, sessionId: "session-1", peers: [],
  }) }))
  assert.equal(manager.getSnapshot().status, "connected")
  socket.close()
  t.mock.timers.tick(250)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(sockets.length, 5)
})

test("cell presence deduplicates the same user within a cell", () => {
  const collaborator = (
    sessionId: string,
    rowId = "row-1",
  ): DatabasePresenceCollaborator => ({
    color: "#2563eb",
    connectedAt: "2026-07-14T12:00:00.000Z",
    presence: { columnKey: "property-status", rowId, viewId: "view-1" },
    sessionId,
    updatedAt: "2026-07-14T12:00:00.000Z",
    user: { id: "user-2", name: "User Two" },
  })
  const result = createCellPresenceByKey([
    collaborator("session-1"),
    collaborator("session-2"),
    collaborator("session-3", "row-2"),
  ])

  assert.equal(result["row-1:property-status"]?.length, 1)
  assert.equal(result["row-2:property-status"]?.length, 1)
})

test("presence equality is based on stable cell fields", () => {
  assert.equal(
    samePresence(
      { columnKey: "status", rowId: "row-1", viewId: "view-1" },
      { columnKey: "status", rowId: "row-1", viewId: "view-1" },
    ),
    true,
  )
  assert.equal(
    samePresence(
      { columnKey: "status", rowId: "row-1", viewId: "view-1" },
      { columnKey: "status", rowId: "row-2", viewId: "view-1" },
    ),
    false,
  )
  assert.equal(samePresence(null, null), true)
})

test("connecting realtime sockets are not closed until they open", () => {
  const listeners = new Map<string, Array<() => void>>()
  const socket = {
    readyState: 0,
    closeCalls: [] as Array<{ code: number; reason: string }>,
    addEventListener(type: string, listener: () => void) {
      const current = listeners.get(type) ?? []
      current.push(listener)
      listeners.set(type, current)
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((item) => item !== listener),
      )
    },
    close(code: number, reason: string) {
      this.closeCalls.push({ code, reason })
    },
  }

  closeRealtimeSocket(socket as unknown as WebSocket, 1000, "Database view closed")
  assert.deepEqual(socket.closeCalls, [])

  socket.readyState = 1
  for (const listener of listeners.get("open") ?? []) listener()
  assert.deepEqual(socket.closeCalls, [
    { code: 1000, reason: "Database view closed" },
  ])
})

test("reconnects use capped full jitter", () => {
  assert.equal(reconnectDelay(0, () => 0.5), 250)
  assert.equal(reconnectDelay(20, () => 0.5), 15_000)
  assert.equal(reconnectDelay(20, () => 1), 30_000)
})

test("heartbeat pings stay under the idle timeout and use a JSON keepalive", () => {
  assert.equal(DATABASE_REALTIME_PING.type, "realtime.ping")
  assert.ok(DATABASE_REALTIME_HEARTBEAT_MS < 30_000)
  assert.ok(DATABASE_REALTIME_HEARTBEAT_MS >= 10_000)
})

test("ticket failures stop only for permanent authorization and lookup errors", () => {
  for (const status of [401, 403, 404]) {
    assert.equal(ticketFailureAction({ status }), "stop")
  }

  for (const status of [408, 429, 500, 503]) {
    assert.equal(ticketFailureAction({ status }), "retry")
  }

  assert.equal(ticketFailureAction(new TypeError("Failed to fetch")), "retry")
})

test("database realtime control messages require protocol v2", () => {
  assert.deepEqual(
    parseDatabaseRealtimeServerMessage(JSON.stringify({
      databaseId: "database-1",
      peers: [],
      protocolVersion: 1,
      sessionId: "session-1",
      type: "realtime.ready",
      version: 4,
    })),
    { ok: false, reason: "protocol_mismatch" },
  )

  const parsed = parseDatabaseRealtimeServerMessage(JSON.stringify({
    databaseId: "database-1",
    databaseVersion: 4,
    peers: [],
    protocolVersion: 2,
    sessionId: "session-1",
    type: "realtime.ready",
  }))
  assert.equal(parsed.ok, true)
  if (parsed.ok && parsed.message.type === "realtime.ready") {
    assert.equal(parsed.message.databaseVersion, 4)
  }
})
