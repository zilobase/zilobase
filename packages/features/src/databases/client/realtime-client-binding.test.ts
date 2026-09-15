import assert from "node:assert/strict"
import test from "node:test"

import type { DatabaseMutationEventV2 } from "../contracts-v2"
import { createRealtimeClientBinding } from "./realtime-client-binding"

const event = {
  actorId: "user-1",
  areas: ["records"],
  changes: {},
  commandId: "command-1",
  committedAt: "2026-09-15T00:00:00.000Z",
  databaseId: "database-1",
  dataSourceId: "source-1",
  eventId: "event-1",
  protocolVersion: 2,
  type: "database.mutation",
  version: 2,
} satisfies DatabaseMutationEventV2

test("realtime delivery follows the current session database client", async () => {
  const deliveries: string[] = []
  const binding = createRealtimeClientBinding({
    catchUp: async () => undefined,
    ingest: async () => { deliveries.push("old") },
  })

  binding.bind({
    catchUp: async () => { deliveries.push("catch-up") },
    ingest: async () => { deliveries.push("current") },
  })
  assert.equal(await binding.ingest(event), true)
  assert.equal(await binding.catchUp("database-1"), true)
  assert.deepEqual(deliveries, ["current", "catch-up"])

  binding.bind(null)
  assert.equal(await binding.ingest(event), false)
  assert.equal(await binding.catchUp("database-1"), false)
  assert.deepEqual(deliveries, ["current", "catch-up"])
})
