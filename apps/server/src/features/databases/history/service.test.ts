import assert from "node:assert/strict"
import { test, vi } from "vitest"

import { getDatabaseMutationFeed, pruneDatabaseMutationHistory } from "./service"

const event = (version: number, requiresReset = false) => ({
  actorId: "user-1",
  areas: ["records"],
  changes: {},
  commandId: "command-1",
  committedAt: new Date("2026-09-14T00:00:00.000Z"),
  databaseId: "database-1",
  dataSourceId: "source-1",
  id: `event-${version}`,
  protocolVersion: 2,
  requiresReset,
  version,
})

function reader(version: number, events: ReturnType<typeof event>[]) {
  let reads = 0
  return {
    select() {
      reads += 1
      return {
        from() {
          return {
            where() {
              return reads === 1
                ? { async limit() { return [{ version }] } }
                : {
                    orderBy() {
                      return { async limit(limit: number) { return events.slice(0, limit) } }
                    },
                  }
            },
          }
        },
      }
    },
  }
}

test("catch-up returns contiguous ordered events and advertises another page", async () => {
  const result = await getDatabaseMutationFeed({
    afterVersion: 2,
    databaseId: "database-1",
    limit: 2,
  }, reader(5, [event(3), event(4), event(5)]) as never)
  assert.equal(result.resetRequired, false)
  assert.equal(result.hasMore, true)
  assert.deepEqual(result.events.map(({ version }) => version), [3, 4])
  assert.equal(result.latestVersion, 5)
})

test("missing, reset, expired, and future history require a scoped reset", async () => {
  for (const [afterVersion, events] of [
    [2, [event(4)]],
    [2, [event(3, true)]],
    [2, []],
    [8, []],
  ] as const) {
    const result = await getDatabaseMutationFeed({
      afterVersion,
      databaseId: "database-1",
    }, reader(5, [...events]) as never)
    assert.equal(result.resetRequired, true)
    assert.deepEqual(result.events, [])
  }
})

test("a client at the current version needs no retained history", async () => {
  assert.deepEqual(await getDatabaseMutationFeed({
    afterVersion: 5,
    databaseId: "database-1",
  }, reader(5, []) as never), {
    events: [],
    hasMore: false,
    latestVersion: 5,
    resetRequired: false,
  })
})

test("history cleanup preserves the per-database floor and removes expired receipts", async () => {
  const where = vi.fn(async () => undefined)
  const executor = {
    delete: vi.fn(() => ({ where })),
    execute: vi.fn(async () => undefined),
  }
  await pruneDatabaseMutationHistory(
    executor as never,
    new Date("2026-09-14T00:00:00.000Z"),
  )
  assert.equal(executor.execute.mock.calls.length, 1)
  assert.equal(executor.delete.mock.calls.length, 1)
  assert.equal(where.mock.calls.length, 1)
})
