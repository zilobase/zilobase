import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"

import {
  createMailRealtimeTicket,
  verifyMailRealtimeTicket,
} from "./mail-realtime-ticket"

const env = { COLLABORATION_SECRET: "mail-realtime-test-secret" }

afterEach(() => vi.useRealTimers())

test("mail realtime tickets preserve the connection owner and expire quickly", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"))
  const result = await createMailRealtimeTicket({
    connectionId: "connection-1",
    userId: "user-1",
  }, env)
  const claims = await verifyMailRealtimeTicket(result.ticket, env)

  assert.equal(claims.connectionId, "connection-1")
  assert.equal(claims.userId, "user-1")
  assert.equal(claims.exp, Date.now() + 5 * 60_000)
  assert.equal(result.expiresAt, new Date(claims.exp).toISOString())

  vi.advanceTimersByTime(5 * 60_000 + 1)
  await assert.rejects(
    verifyMailRealtimeTicket(result.ticket, env),
    /Expired mail realtime ticket/,
  )
})

test("mail realtime tickets reject tampering and the wrong signing key", async () => {
  const { ticket } = await createMailRealtimeTicket({
    connectionId: "connection-1",
    userId: "user-1",
  }, env)
  const [payload, signature] = ticket.split(".")
  const tampered = `${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`

  await assert.rejects(
    verifyMailRealtimeTicket(`${payload}.${tampered}`, env),
    /Invalid mail realtime ticket/,
  )
  await assert.rejects(
    verifyMailRealtimeTicket(ticket, { COLLABORATION_SECRET: "another-secret" }),
    /Invalid mail realtime ticket/,
  )
})
