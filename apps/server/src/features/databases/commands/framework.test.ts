import assert from "node:assert/strict"
import { beforeEach, test, vi } from "vitest"
import type { DatabaseCommandAck, DatabaseCommandRequest } from "@zilobase/features/databases/contracts"

import {
  dataSource,
  database,
  databaseCommandReceipt,
  databaseMutationEvent,
} from "../../../infrastructure/database/schema"
import {
  CommandIdReusedError,
  executeDatabaseCommand,
  hashDatabaseCommandRequest,
  type DatabaseCommandContext,
  type DatabaseCommandDispatcher,
} from "./framework"

const request: DatabaseCommandRequest = {
  command: { patch: { config: { b: 2, a: 1 } }, type: "database.update" },
  commandId: "command-1",
  protocolVersion: 2,
}

const replayAck: DatabaseCommandAck = {
  commandId: "command-1",
  event: {
    actorId: "user-1",
    areas: ["databases"],
    changes: {},
    commandId: "command-1",
    committedAt: "2026-09-14T00:00:00.000Z",
    databaseId: "database-1",
    dataSourceId: null,
    eventId: "event-existing",
    protocolVersion: 2,
    type: "database.mutation",
    version: 4,
  },
  result: { saved: true },
}

function transactionHarness(options: {
  databaseVersions?: number[]
  linked?: boolean
  receipt?: Record<string, unknown>
  sourceVersion?: number
} = {}) {
  const inserts = new Map<unknown, unknown[]>()
  const updates: unknown[] = []
  const databaseVersions = [...(options.databaseVersions ?? [5])]
  const execute = vi.fn(async () => undefined)

  const rowsFor = (table: unknown) => {
    if (table === databaseCommandReceipt) {
      return options.receipt ? [options.receipt] : []
    }
    return options.linked === false ? [] : [{ dataSourceId: "source-1" }]
  }
  const tx = {
    execute,
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          inserts.set(table, [
            ...(inserts.get(table) ?? []),
            ...(Array.isArray(value) ? value : [value]),
          ])
        },
      }
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                for() {
                  return { async limit() { return rowsFor(table) } }
                },
                async limit() { return rowsFor(table) },
              }
            },
          }
        },
      }
    },
    update(table: unknown) {
      updates.push(table)
      return {
        set() {
          return {
            where() {
              return {
                async returning() {
                  if (table === dataSource) {
                    return options.sourceVersion === undefined
                      ? []
                      : [{ version: options.sourceVersion }]
                  }
                  assert.equal(table, database)
                  const version = databaseVersions.shift()
                  return version === undefined ? [] : [{ version }]
                },
              }
            },
          }
        },
      }
    },
  }
  return {
    database: { transaction: async <T>(callback: (active: typeof tx) => Promise<T>) => callback(tx) },
    execute,
    inserts,
    updates,
  }
}

beforeEach(() => vi.restoreAllMocks())

test("command hashes are stable across object key order and include route scope", async () => {
  const reordered: DatabaseCommandRequest = {
    ...request,
    command: { patch: { config: { a: 1, b: 2 } }, type: "database.update" },
  }
  const host = { databaseId: "database-1", dataSourceId: null }
  assert.equal(
    await hashDatabaseCommandRequest(host, request),
    await hashDatabaseCommandRequest(host, reordered),
  )
  assert.notEqual(
    await hashDatabaseCommandRequest(host, request),
    await hashDatabaseCommandRequest({ ...host, databaseId: "database-2" }, request),
  )
})

test("execution locks the command ID and atomically stores its event and receipt", async () => {
  const harness = transactionHarness({ databaseVersions: [5] })
  const dispatchMock = vi.fn(async (context: DatabaseCommandContext) => ({
    mutations: [{
      areas: ["databases"] as const,
      changes: {},
      databaseId: context.databaseId,
      dataSourceId: null,
    }],
    result: { saved: true },
  }))
  const dispatch = dispatchMock as unknown as DatabaseCommandDispatcher

  const ack = await executeDatabaseCommand({
    actorId: "user-1",
    request,
    scope: { databaseId: "database-1", dataSourceId: null },
  }, {
    database: harness.database as never,
    dispatch,
    now: () => new Date("2026-09-14T00:00:00.000Z"),
    randomUUID: () => "event-1",
  })

  assert.equal(harness.execute.mock.calls.length, 1)
  assert.equal(dispatchMock.mock.calls[0]?.[0].commandId, "command-1")
  assert.equal(ack.event.eventId, "event-1")
  assert.equal(ack.event.version, 5)
  assert.equal(harness.inserts.get(databaseMutationEvent)?.length, 1)
  const receipts = harness.inserts.get(databaseCommandReceipt) as Array<{
    acknowledgement: DatabaseCommandAck
    expiresAt: Date
  }>
  assert.equal(receipts.length, 1)
  assert.deepEqual(receipts[0]?.acknowledgement, ack)
  assert.equal(receipts[0]?.expiresAt.toISOString(), "2026-09-21T00:00:00.000Z")
})

test("identical retries replay the stored acknowledgement without side effects", async () => {
  const scope = { databaseId: "database-1", dataSourceId: null }
  const requestHash = await hashDatabaseCommandRequest(scope, request)
  const harness = transactionHarness({
    receipt: {
      acknowledgement: replayAck,
      actorId: "user-1",
      dataSourceId: null,
      databaseId: "database-1",
      requestHash,
    },
  })
  const dispatchMock = vi.fn()
  const dispatch = dispatchMock as unknown as DatabaseCommandDispatcher
  const ack = await executeDatabaseCommand({ actorId: "user-1", request, scope }, {
    database: harness.database as never,
    dispatch,
  })

  assert.deepEqual(ack, replayAck)
  assert.equal(dispatchMock.mock.calls.length, 0)
  assert.equal(harness.inserts.size, 0)
})

test("reusing a command ID with another body is rejected", async () => {
  const harness = transactionHarness({
    receipt: {
      acknowledgement: replayAck,
      actorId: "user-1",
      dataSourceId: null,
      databaseId: "database-1",
      requestHash: "another-request",
    },
  })

  await assert.rejects(
    executeDatabaseCommand({
      actorId: "user-1",
      request,
      scope: { databaseId: "database-1", dataSourceId: null },
    }, {
      database: harness.database as never,
      dispatch: vi.fn() as unknown as DatabaseCommandDispatcher,
    }),
    (error: unknown) =>
      error instanceof CommandIdReusedError && error.status === 409,
  )
})

test("source commands verify host linkage and increment the source version", async () => {
  const unlinked = transactionHarness({ linked: false, sourceVersion: 8 })
  await assert.rejects(
    executeDatabaseCommand({
      actorId: "user-1",
      request: {
        command: { patch: { name: "Tasks" }, type: "dataSource.update" },
        commandId: "source-command",
        protocolVersion: 2,
      },
      scope: { databaseId: "database-1", dataSourceId: "source-1" },
    }, {
      database: unlinked.database as never,
      dispatch: vi.fn() as unknown as DatabaseCommandDispatcher,
    }),
    /Data source is not linked/,
  )
})

test("a linked source version is incremented before its handler builds entities", async () => {
  const harness = transactionHarness({ databaseVersions: [7], sourceVersion: 3 })
  const dispatchMock = vi.fn(async (context: DatabaseCommandContext) => {
    assert.equal(harness.updates[0], dataSource)
    return {
      mutations: [{
        areas: ["dataSources"] as const,
        changes: {},
        databaseId: context.databaseId,
        dataSourceId: context.dataSourceId,
      }],
      result: null,
    }
  })
  await executeDatabaseCommand({
    actorId: "user-1",
    request: {
      command: { patch: { name: "Tasks" }, type: "dataSource.update" },
      commandId: "source-command",
      protocolVersion: 2,
    },
    scope: { databaseId: "database-1", dataSourceId: "source-1" },
  }, {
    database: harness.database as never,
    dispatch: dispatchMock as unknown as DatabaseCommandDispatcher,
  })
  assert.deepEqual(harness.updates.slice(0, 2), [dataSource, database])
})

test("oversized changesets produce a reset event instead of truncated data", async () => {
  const harness = transactionHarness()
  const removedRecordIds = Array.from({ length: 700 }, (_, index) =>
    `row-${String(index).padStart(3, "0")}-${"x".repeat(100)}`
  )
  const dispatch = (async (context) => ({
    mutations: [{
      areas: ["records"],
      changes: { removedRecordIds },
      databaseId: context.databaseId,
      dataSourceId: null,
    }],
    result: null,
  })) as DatabaseCommandDispatcher
  const ack = await executeDatabaseCommand({
    actorId: "user-1",
    request,
    scope: { databaseId: "database-1", dataSourceId: null },
  }, {
    database: harness.database as never,
    dispatch,
    randomUUID: () => "event-large",
  })

  assert.equal(ack.event.requiresReset, true)
  assert.deepEqual(ack.event.changes, {})
})
