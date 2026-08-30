import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { createConnection } from "node:net"
import { test } from "vitest"

import {
  createMailRealtimeTicket,
  MAIL_REALTIME_AUTH_PROTOCOL_PREFIX,
  MAIL_REALTIME_PROTOCOL,
} from "../../features/mail/mail-realtime-ticket"
import type { NodeRealtimeBus } from "../../infrastructure/node/realtime-bus"
import { attachNodeMailRealtimeRuntime } from "./mail-realtime-runtime"

const env = { COLLABORATION_SECRET: "mail-realtime-test-secret" }

test("mail realtime rejects missing tickets and tickets for another connection", async () => {
  const fixture = await startFixture()
  const ticket = await createTicket("connection-2")

  try {
    assert.equal(await requestUpgradeStatus(fixture.url), 401)
    const client = new WebSocket(fixture.url, protocols(ticket))
    await assert.rejects(waitForOpen(client), /WebSocket/)
    client.close()
  } finally {
    await fixture.close()
  }
})

test("mail realtime broadcasts only connection ID and revision locally", async () => {
  const fixture = await startFixture()
  const first = new MailRealtimeClient(fixture.url, await createTicket("connection-1"))
  const second = new MailRealtimeClient(fixture.url, await createTicket("connection-1"))

  try {
    await Promise.all([first.opened, second.opened])
    await Promise.all([first.next("mail.ready"), second.next("mail.ready")])
    await fixture.runtime.publishNotification({
      connectionId: "connection-1",
      revision: 7,
      userId: "user-1",
    })
    const [one, two] = await Promise.all([
      first.next("mail.invalidate"),
      second.next("mail.invalidate"),
    ])
    assert.deepEqual(one, { connectionId: "connection-1", revision: 7, type: "mail.invalidate" })
    assert.deepEqual(two, one)
  } finally {
    first.close()
    second.close()
    await fixture.close()
  }
})

test("mail realtime fans out through the multi-node realtime bus", async () => {
  const broker = new TestRealtimeBroker()
  const publisher = await startFixture(broker.createBus())
  const subscriber = await startFixture(broker.createBus())
  const client = new MailRealtimeClient(subscriber.url, await createTicket("connection-1"))

  try {
    await client.opened
    await client.next("mail.ready")
    await publisher.runtime.publishNotification({
      connectionId: "connection-1",
      revision: 9,
      userId: "user-1",
    })
    assert.equal((await client.next("mail.invalidate")).revision, 9)
  } finally {
    client.close()
    await Promise.all([publisher.close(), subscriber.close()])
  }
})

async function startFixture(realtimeBus?: NodeRealtimeBus) {
  const server = createServer((_request, response) => response.end())
  const runtime = attachNodeMailRealtimeRuntime(server, env, { realtimeBus })
  await listen(server)
  const address = server.address()
  assert(address && typeof address === "object")
  return {
    close: async () => {
      await runtime.destroy()
      await closeServer(server)
    },
    runtime,
    url: `ws://127.0.0.1:${address.port}/mail-realtime?connection=connection-1`,
  }
}

class TestRealtimeBroker {
  private readonly channels = new Map<string, Set<{ handler: (payload: unknown) => void; instance: symbol }>>()

  createBus(): NodeRealtimeBus {
    const instance = Symbol("mail-realtime-instance")
    return {
      async close() {},
      async connect() {},
      async consumeLimit() { return true },
      isReady() { return true },
      publish: async (channel, payload) => {
        this.channels.get(channel)?.forEach((subscription) => {
          if (subscription.instance !== instance) subscription.handler(payload)
        })
      },
      subscribe: async (channel, handler) => {
        const subscription = { handler, instance }
        const subscriptions = this.channels.get(channel) ?? new Set()
        subscriptions.add(subscription)
        this.channels.set(channel, subscriptions)
        return async () => {
          subscriptions.delete(subscription)
          if (subscriptions.size === 0) this.channels.delete(channel)
        }
      },
    }
  }
}

class MailRealtimeClient {
  readonly websocket: WebSocket
  readonly opened: Promise<void>
  private readonly messages: Array<Record<string, unknown>> = []
  private readonly waiters = new Set<{ resolve: (message: Record<string, unknown>) => void; type: string }>()

  constructor(url: string, ticket: string) {
    this.websocket = new WebSocket(url, protocols(ticket))
    this.opened = waitForOpen(this.websocket)
    this.websocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>
      const waiter = [...this.waiters].find(({ type }) => type === message.type)
      if (waiter) {
        this.waiters.delete(waiter)
        waiter.resolve(message)
      } else this.messages.push(message)
    })
  }

  close() { this.websocket.close() }

  next(type: string, timeout = 1_000) {
    const existing = this.messages.findIndex((message) => message.type === type)
    if (existing >= 0) return Promise.resolve(this.messages.splice(existing, 1)[0]!)
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const waiter = { resolve, type }
      this.waiters.add(waiter)
      setTimeout(() => {
        if (this.waiters.delete(waiter)) reject(new Error(`Timed out waiting for ${type}`))
      }, timeout)
    })
  }
}

function createTicket(connectionId: string) {
  return createMailRealtimeTicket({ connectionId, userId: "user-1" }, env).then((result) => result.ticket)
}

function protocols(ticket: string) {
  return [MAIL_REALTIME_PROTOCOL, `${MAIL_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket}`]
}

function waitForOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true })
    socket.addEventListener("error", () => reject(new Error("WebSocket upgrade failed")), { once: true })
  })
}

function listen(server: Server) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

function requestUpgradeStatus(url: string) {
  const target = new URL(url)
  return new Promise<number>((resolve, reject) => {
    const socket = createConnection(Number(target.port), target.hostname)
    let response = ""
    socket.setEncoding("utf8")
    socket.once("error", reject)
    socket.on("data", (chunk) => { response += chunk })
    socket.once("end", () => {
      const status = Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1])
      if (Number.isInteger(status)) resolve(status)
      else reject(new Error(`Invalid upgrade response: ${response}`))
    })
    socket.once("connect", () => socket.write([
      `GET ${target.pathname}${target.search} HTTP/1.1`,
      `Host: ${target.host}`,
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n")))
  })
}
