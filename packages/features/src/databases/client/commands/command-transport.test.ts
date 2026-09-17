import assert from "node:assert/strict"
import test from "node:test"
import { sendDatabaseCommand, DatabaseCommandUnconfirmedError } from "./command-transport"

const input = { databaseId: "host", command: { type: "database.update" as const, patch: { name: "Saved" } } }
const ack = {
  commandId: "command-1", result: { name: "Saved" },
  event: {
    actorId: "actor", areas: ["databases"], changes: {}, commandId: "command-1",
    committedAt: "2026-09-17T00:00:00.000Z", databaseId: "host", dataSourceId: null,
    eventId: "event-1", protocolVersion: 2, type: "database.mutation", version: 1,
  },
}

test("a lost acknowledgement replays the identical request instead of creating another command", async () => {
  const bodies: string[] = []
  const result = await sendDatabaseCommand(async (_path, options) => {
    bodies.push(String(options?.body))
    if (bodies.length === 1) throw new TypeError("Network response lost after commit")
    return ack as never
  }, input, "command-1")
  assert.deepEqual(result.result, { name: "Saved" })
  assert.equal(bodies.length, 2)
  assert.equal(bodies[0], bodies[1])
})

test("validation and access failures are not retried", async () => {
  let attempts = 0
  const failure = Object.assign(new Error("Forbidden"), { status: 403 })
  await assert.rejects(sendDatabaseCommand(async () => {
    attempts += 1
    throw failure
  }, input, "command-1"), failure)
  assert.equal(attempts, 1)
})

test("repeated connection failures remain explicitly unconfirmed", async () => {
  let attempts = 0
  await assert.rejects(sendDatabaseCommand(async () => {
    attempts += 1
    throw new TypeError("Network unavailable")
  }, input, "command-1"), DatabaseCommandUnconfirmedError)
  assert.equal(attempts, 2)
})

test("an acknowledgement cannot carry an event for a different command", async () => {
  await assert.rejects(sendDatabaseCommand(async () => ({
    ...ack, event: { ...ack.event, commandId: "other-command" },
  }) as never, input, "command-1"), DatabaseCommandUnconfirmedError)
})
