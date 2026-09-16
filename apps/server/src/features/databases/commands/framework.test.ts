import assert from "node:assert/strict"
import { beforeEach, test, vi } from "vitest"
import type { DatabaseCommandAck, DatabaseCommandRequest } from "@zilobase/features/databases/contracts"
import { runWithRuntimeAdapter } from "../../../infrastructure/runtime/runtime-adapter"

const background = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock("../../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: background.dispatch,
}))

import {
  dataSource,
  database,
  databaseCommandReceipt,
  databaseMutationEvent,
  databaseRealtimeOutbox,
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
  const deleted: string[] = []
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
    database: {
      delete() {
        return { async where() { deleted.push("deleted") } }
      },
      transaction: async <T>(callback: (active: typeof tx) => Promise<T>) => callback(tx),
    },
    deleted,
    execute,
    inserts,
    updates,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  background.dispatch.mockReset()
  background.dispatch.mockResolvedValue(true)
})

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
  assert.equal(ack.event.protocolVersion, 2)
  if (ack.event.protocolVersion !== 2) throw new Error("Expected a host event")
  assert.equal(ack.event.version, 5)
  assert.equal(harness.inserts.get(databaseMutationEvent)?.length, 1)
  assert.deepEqual(harness.inserts.get(databaseRealtimeOutbox), [{
    eventId: "event-1",
    id: "event-1",
  }])
  const receipts = harness.inserts.get(databaseCommandReceipt) as Array<{
    acknowledgement: DatabaseCommandAck
    expiresAt: Date
  }>
  assert.equal(receipts.length, 1)
  assert.deepEqual(receipts[0]?.acknowledgement, ack)
  assert.equal(receipts[0]?.expiresAt.toISOString(), "2026-09-21T00:00:00.000Z")
})

test("committed commands enqueue delivery without publishing a socket event inline", async () => {
  const harness = transactionHarness({ databaseVersions: [5] })
  const dispatch = (async (context: DatabaseCommandContext) => ({
    mutations: [{
      areas: ["databases"],
      changes: {},
      databaseId: context.databaseId,
      dataSourceId: null,
    }],
    result: null,
  })) as DatabaseCommandDispatcher
  await executeDatabaseCommand({
    actorId: "user-1",
    env: { ZILOBASE_RUNTIME_KIND: "edge" },
    request,
    scope: { databaseId: "database-1", dataSourceId: null },
  }, {
    database: harness.database as never,
    dispatch,
    randomUUID: () => "event-background",
  })
  assert.equal(background.dispatch.mock.calls.length, 1)
  assert.deepEqual(background.dispatch.mock.calls[0]?.[1].map(
    (task: { kind: string; resourceId: string }) => ({
      kind: task.kind,
      resourceId: task.resourceId,
    }),
  ), [{ kind: "realtime.database", resourceId: "event-background" }])
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

test("a linked source command persists one event on the source clock", async () => {
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
  const ack = await executeDatabaseCommand({
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
    now: () => new Date("2026-09-16T00:00:00.000Z"),
    randomUUID: () => "source-event-3",
  })
  assert.deepEqual(harness.updates, [dataSource])
  assert.deepEqual(ack.event, {
    actorId: "user-1",
    areas: ["source"],
    changes: {},
    commandId: "source-command",
    committedAt: "2026-09-16T00:00:00.000Z",
    eventId: "source-event-3",
    protocolVersion: 3,
    sourceId: "source-1",
    sourceVersion: 3,
    type: "database.mutation",
  })
  assert.deepEqual(harness.inserts.get(databaseMutationEvent), [{
    actorId: "user-1",
    areas: ["source"],
    changes: {},
    commandId: "source-command",
    committedAt: new Date("2026-09-16T00:00:00.000Z"),
    databaseId: null,
    dataSourceId: "source-1",
    id: "source-event-3",
    protocolVersion: 3,
    requiresReset: false,
    sourceId: "source-1",
    streamKind: "source",
    version: 3,
  }])
})

test("source commands publish before returning and do not enqueue on success", async () => {
  const harness = transactionHarness({ sourceVersion: 4 })
  const publish = vi.fn(async (_input: {
    event: { sourceVersion: number }
  }) => undefined)
  const dispatch = (async (context: DatabaseCommandContext) => ({
    mutations: [{
      areas: ["records"],
      changes: { removedRecordIds: ["row-1"] },
      databaseId: context.databaseId,
      dataSourceId: context.dataSourceId,
    }],
    result: null,
  })) as DatabaseCommandDispatcher

  await runWithRuntimeAdapter(
    { publishDatabaseMutation: publish },
    () => executeDatabaseCommand({
      actorId: "user-1",
      env: { ZILOBASE_RUNTIME_KIND: "node" },
      request: {
        command: { rowId: "row-1", type: "row.archive" },
        commandId: "source-command",
        protocolVersion: 2,
      },
      scope: { databaseId: "database-1", dataSourceId: "source-1" },
    }, {
      database: harness.database as never,
      dispatch,
      randomUUID: () => "source-event-4",
    }),
  )

  assert.equal(publish.mock.calls.length, 1)
  assert.equal(publish.mock.calls[0]?.[0].event.sourceVersion, 4)
  assert.deepEqual(harness.deleted, ["deleted"])
  assert.deepEqual(background.dispatch.mock.calls[0]?.[1], [])
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
