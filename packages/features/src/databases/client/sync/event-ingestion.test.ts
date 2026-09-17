import assert from "node:assert/strict"
import test from "node:test"
import { DatabaseEventIngestion } from "./event-ingestion"
import type { DatabaseMutationEventV2 } from  "../../core/entities"

const event: DatabaseMutationEventV2 = {
  actorId: "actor", areas: ["databases"], changes: {}, commandId: "command",
  committedAt: "2026-09-17T00:00:00.000Z", databaseId: "host", dataSourceId: null,
  eventId: "event", protocolVersion: 2, type: "database.mutation", version: 2,
}

test("a partially applied event remains retryable even when one snapshot advanced", async () => {
  let version = 1
  let applications = 0
  const ingestion = new DatabaseEventIngestion({
    apiFetch: async () => { throw new Error("Unexpected history read") },
    apply: async () => {
      applications += 1
      version = 2
      if (applications === 1) throw new Error("Record projection failed")
    },
    loadedVersion: () => version,
    reset: async () => {},
  })
  await assert.rejects(ingestion.ingest(event), /Record projection failed/)
  await ingestion.ingest(event)
  await ingestion.ingest(event)
  assert.equal(applications, 2)
})

test("a feed repeating the same page resets instead of looping forever", async () => {
  let reads = 0
  let resets = 0
  const ingestion = new DatabaseEventIngestion({
    apiFetch: async () => {
      reads += 1
      assert.ok(reads <= 2)
      return { events: [event], hasMore: true, latestVersion: 3, resetRequired: false } as never
    },
    apply: async () => {}, loadedVersion: () => 1,
    reset: async () => { resets += 1 },
  })
  await ingestion.catchUp("host")
  assert.equal(reads, 2)
  assert.equal(resets, 1)
})

test("failed history resets do not discard the old recovery cursor", async () => {
  let resets = 0
  const paths: string[] = []
  const ingestion = new DatabaseEventIngestion({
    apiFetch: async (path) => {
      paths.push(path)
      return { events: [], hasMore: false, latestVersion: 5, resetRequired: true } as never
    },
    apply: async () => {}, loadedVersion: () => 1,
    reset: async () => {
      resets += 1
      if (resets === 1) throw new Error("Offline")
    },
  })
  await assert.rejects(ingestion.catchUp("host"), /Offline/)
  await ingestion.catchUp("host")
  assert.equal(paths.length, 2)
  assert.ok(paths.every((path) => path.includes("afterVersion=1")))
})
