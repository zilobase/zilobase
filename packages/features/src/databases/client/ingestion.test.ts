import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import type { ApiFetcher } from "../../shared/api-fetcher"
import type {
  DatabaseBootstrapResponse,
  DatabaseHostEntity,
  DatabaseMutationEventV2,
  DatabaseRecordEntity,
  DataSourceMutationEventV3,
} from "../contracts-v2"
import { databaseContextExportQueryKey } from "../queries"
import { createDatabaseClient } from "./database-client"

const timestamp = "2026-09-14T00:00:00.000Z"

function host(version: number, name = `Database ${version}`): DatabaseHostEntity {
  return {
    accessLevel: "edit",
    config: {},
    createdAt: timestamp,
    id: "database-1",
    name,
    pageId: null,
    updatedAt: timestamp,
    version,
    workspaceId: "workspace-1",
  }
}

function bootstrap(version: number, name?: string): DatabaseBootstrapResponse {
  return {
    database: host(version, name),
    dataSources: [],
    properties: [],
    views: [],
  }
}

function record(
  id: string,
  orderKey: string,
  name = id,
): DatabaseRecordEntity {
  return {
    createdAt: timestamp,
    dataSourceId: "source-1",
    id,
    orderKey,
    page: {
      createdAt: timestamp,
      deletedAt: null,
      hasContent: false,
      id: `page-${id}`,
      metadata: {},
      name,
      updatedAt: timestamp,
    },
    pageId: `page-${id}`,
    parentRowId: null,
    updatedAt: timestamp,
    valuesByPropertyId: {},
  }
}

function recordWithValues(
  values: Record<string, unknown>,
  options: { id?: string; orderKey?: string } = {},
) {
  const entity = record(
    options.id ?? "row-1",
    options.orderKey ?? "1024.0000000000",
  )
  entity.valuesByPropertyId = Object.fromEntries(
    Object.entries(values).map(([propertyId, value]) => [
      propertyId,
      {
        createdAt: timestamp,
        id: `value-${propertyId}`,
        pageId: entity.pageId,
        propertyId,
        updatedAt: timestamp,
        value,
      },
    ]),
  )
  return entity
}

function event(
  version: number,
  changes: DatabaseMutationEventV2["changes"],
  options: { commandId?: string; eventId?: string } = {},
): DatabaseMutationEventV2 {
  return {
    actorId: "actor-1",
    areas: changes.records || changes.removedRecordIds
      ? ["records"]
      : ["databases"],
    changes,
    commandId: options.commandId ?? `command-${version}`,
    committedAt: timestamp,
    databaseId: "database-1",
    dataSourceId: changes.records || changes.removedRecordIds
      ? "source-1"
      : null,
    eventId: options.eventId ?? `event-${version}`,
    protocolVersion: 2,
    type: "database.mutation",
    version,
  }
}

function sourceEvent(
  sourceVersion: number,
  changes: DataSourceMutationEventV3["changes"],
  options: { commandId?: string; eventId?: string } = {},
): DataSourceMutationEventV3 {
  return {
    actorId: "actor-1",
    areas: changes.records || changes.removedRecordIds
      ? ["records"]
      : ["properties"],
    changes,
    commandId: options.commandId ?? `command-${sourceVersion}`,
    committedAt: timestamp,
    eventId: options.eventId ?? `source-event-${sourceVersion}`,
    protocolVersion: 3,
    sourceId: "source-1",
    sourceVersion,
    type: "database.mutation",
  }
}

function orderedRecordIds(
  records: ReturnType<ReturnType<typeof createDatabaseClient>["getRecordCollection"]>,
) {
  return [...records.records.state.values()]
    .sort((left, right) => left.__windowIndex - right.__windowIndex)
    .map(({ id }) => id)
}

test("command acknowledgements and socket echoes share one direct-write path", async () => {
  const paths: string[] = []
  let acknowledged: DataSourceMutationEventV3 | undefined
  const initialRecords = [
    record("row-1", "1024.0000000000"),
    record("row-2", "2048.0000000000"),
  ]
  const apiFetch: ApiFetcher = async (path, init) => {
    paths.push(path)
    if (path.includes("/bootstrap")) return bootstrap(1) as never
    if (path.includes("/records?")) {
      return {
        databaseVersion: 1,
        dataSourceVersion: 1,
        hasMore: false,
        offset: 0,
        records: initialRecords,
        snapshot: "snapshot-1",
        totalCount: 2,
      } as never
    }
    if (path.endsWith("/data-sources/source-1/commands")) {
      const request = JSON.parse(String(init?.body)) as { commandId: string }
      acknowledged = sourceEvent(2, {
        records: [record("row-1", "3072.0000000000", "Moved")],
      }, { commandId: request.commandId })
      return {
        commandId: request.commandId,
        event: acknowledged,
        result: { updated: true },
      } as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const collections = client.getBootstrapCollections({ databaseId: "database-1" })
  await collections.database.stateWhenReady()
  const records = client.getRecordCollection({
    databaseId: "database-1",
    dataSourceId: "source-1",
    viewId: "view-1",
  })
  records.records._sync.startSync()
  await records.records._sync.loadSubset({ limit: 51, offset: 0 })

  const transaction = client.execute<{ updated: boolean }>({
    command: {
      propertyId: "property-1",
      rowId: "row-1",
      type: "cell.set",
      value: "done",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  assert.equal(
    records.records.state.get("row-1")
      ?.valuesByPropertyId["property-1"]?.value,
    "done",
  )
  assert.deepEqual(await transaction.promise, { updated: true })
  assert.equal(records.records.state.get("row-1")?.page.name, "Moved")
  assert.equal(records.records.state.get("row-1")?.__windowIndex, 1)
  assert.equal(records.records.state.get("row-2")?.__windowIndex, 0)
  assert.equal(client.bootstrap({ databaseId: "database-1" }).data?.database.version, 1)

  await client.ingest(acknowledged!)
  assert.equal(paths.filter((path) => path.includes("/mutations?")).length, 0)
  assert.equal(records.records.size, 2)
  await client.cleanup()
})

test("authoritative events invalidate only the explicit AI context export", async () => {
  const queryClient = new QueryClient()
  const exportKey = databaseContextExportQueryKey("database-1")
  queryClient.setQueryData(exportKey, { rows: [] })
  const apiFetch: ApiFetcher = async (path) => {
    if (path.includes("/bootstrap")) return bootstrap(1) as never
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient,
    sessionId: "session-1",
  })
  const collections = client.getBootstrapCollections({ databaseId: "database-1" })
  await collections.database.stateWhenReady()

  await client.ingest(event(2, { databases: [host(2)] }))

  assert.equal(queryClient.getQueryState(exportKey)?.isInvalidated, true)
  await client.cleanup()
})

test("a version gap catches up in order before applying the socket event", async () => {
  const paths: string[] = []
  const second = event(2, { databases: [host(2, "Second")] })
  const third = event(3, { databases: [host(3, "Third")] })
  const apiFetch: ApiFetcher = async (path) => {
    paths.push(path)
    if (path.includes("/bootstrap")) return bootstrap(1, "First") as never
    if (path.includes("afterVersion=1")) {
      return {
        events: [second],
        hasMore: true,
        latestVersion: 3,
        resetRequired: false,
      } as never
    }
    if (path.includes("afterVersion=2")) {
      return {
        events: [third],
        hasMore: false,
        latestVersion: 3,
        resetRequired: false,
      } as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const collections = client.getBootstrapCollections({ databaseId: "database-1" })
  await collections.database.stateWhenReady()

  await client.ingest(third)
  await client.ingest(third)

  assert.deepEqual(
    paths.filter((path) => path.includes("/mutations?")),
    [
      "/databases/database-1/mutations?afterVersion=1&limit=500",
      "/databases/database-1/mutations?afterVersion=2&limit=500",
    ],
  )
  assert.equal(client.bootstrap({ databaseId: "database-1" }).data?.database.name, "Third")
  assert.equal(collections.database.state.get("database-1")?.version, 3)
  await client.cleanup()
})

test("expired history resets only the affected database scope", async () => {
  let databaseOneFetches = 0
  let databaseTwoFetches = 0
  const apiFetch: ApiFetcher = async (path) => {
    if (path === "/databases/database-1/bootstrap") {
      databaseOneFetches += 1
      return bootstrap(databaseOneFetches === 1 ? 1 : 4, "Canonical") as never
    }
    if (path === "/databases/database-2/bootstrap") {
      databaseTwoFetches += 1
      return {
        ...bootstrap(7, "Other"),
        database: { ...host(7, "Other"), id: "database-2" },
      } as never
    }
    if (path.includes("database-1/mutations?")) {
      return {
        events: [],
        hasMore: false,
        latestVersion: 4,
        resetRequired: true,
      } as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const first = client.getBootstrapCollections({ databaseId: "database-1" })
  const other = client.getBootstrapCollections({ databaseId: "database-2" })
  await Promise.all([
    first.database.stateWhenReady(),
    other.database.stateWhenReady(),
  ])

  await client.ingest(event(4, { databases: [host(4, "Ignored delta")] }))

  assert.equal(databaseOneFetches, 2)
  assert.equal(databaseTwoFetches, 1)
  assert.equal(client.bootstrap({ databaseId: "database-1" }).data?.database.name, "Canonical")
  assert.equal(client.bootstrap({ databaseId: "database-2" }).data?.database.name, "Other")
  await client.cleanup()
})

test("row ordering paints optimistically before its command is sent", async () => {
  let resolveCommand: ((value: unknown) => void) | undefined
  let commandId = ""
  const apiFetch: ApiFetcher = async (path, init) => {
    if (path.includes("/bootstrap")) return bootstrap(1) as never
    if (path.includes("/records?")) {
      return {
        databaseVersion: 1,
        dataSourceVersion: 1,
        hasMore: false,
        offset: 0,
        records: [
          record("row-1", "1024.0000000000"),
          record("row-2", "2048.0000000000"),
          record("row-3", "3072.0000000000"),
        ],
        snapshot: "snapshot-1",
        totalCount: 3,
      } as never
    }
    if (path.endsWith("/data-sources/source-1/commands")) {
      commandId = (JSON.parse(String(init?.body)) as { commandId: string }).commandId
      return await new Promise<unknown>((resolve) => {
        resolveCommand = resolve
      }) as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const collections = client.getBootstrapCollections({ databaseId: "database-1" })
  await collections.database.stateWhenReady()
  const records = client.getRecordCollection({
    databaseId: "database-1",
    dataSourceId: "source-1",
    viewId: "view-1",
  })
  records.records._sync.startSync()
  await records.records._sync.loadSubset({ limit: 51, offset: 0 })

  const transaction = client.execute<DatabaseRecordEntity>({
    command: {
      afterRowId: "row-3",
      beforeRowId: null,
      rowId: "row-1",
      type: "row.move",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  assert.deepEqual(orderedRecordIds(records), ["row-2", "row-3", "row-1"])

  await Promise.resolve()
  const moved = record("row-1", "4096.0000000000")
  resolveCommand?.({
    commandId,
    event: sourceEvent(2, { records: [moved] }, { commandId }),
    result: moved,
  })
  assert.equal((await transaction.promise).orderKey, "4096.0000000000")
  assert.equal(records.records.state.get("row-1")?.__windowIndex, 2)
  await client.cleanup()
})

test("a failed metadata command rolls back only its optimistic transaction", async () => {
  let rejectCommand: ((error: Error) => void) | undefined
  const apiFetch: ApiFetcher = async (path) => {
    if (path.includes("/bootstrap")) return bootstrap(1, "Original") as never
    if (path.endsWith("/commands")) {
      return await new Promise<unknown>((_resolve, reject) => {
        rejectCommand = reject
      }) as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const collections = client.getBootstrapCollections({ databaseId: "database-1" })
  await collections.database.stateWhenReady()

  const transaction = client.execute({
    command: {
      patch: { name: "Optimistic" },
      type: "database.update",
    },
    databaseId: "database-1",
  })
  assert.equal(collections.database.state.get("database-1")?.name, "Optimistic")

  await Promise.resolve()
  rejectCommand?.(new Error("save failed"))
  await assert.rejects(transaction.promise, /save failed/)
  assert.equal(collections.database.state.get("database-1")?.name, "Original")
  await client.cleanup()
})

test("a failed cell overlay preserves an unrelated pending cell on the same row", async () => {
  const requests = new Map<string, {
    commandId: string
    reject(error: Error): void
    resolve(value: unknown): void
  }>()
  const apiFetch: ApiFetcher = async (path, init) => {
    if (path.includes("/bootstrap")) return bootstrap(1) as never
    if (path.includes("/records?")) {
      return {
        databaseVersion: 1,
        dataSourceVersion: 1,
        hasMore: false,
        offset: 0,
        records: [recordWithValues({ first: "A", second: "B" })],
        snapshot: "snapshot-1",
        totalCount: 1,
      } as never
    }
    if (path.endsWith("/commands")) {
      const body = JSON.parse(String(init?.body)) as {
        command: { propertyId: string }
        commandId: string
      }
      return await new Promise<unknown>((resolve, reject) => {
        requests.set(body.command.propertyId, {
          commandId: body.commandId,
          reject,
          resolve,
        })
      }) as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const records = client.getRecordCollection({
    databaseId: "database-1",
    dataSourceId: "source-1",
    viewId: "view-1",
  })
  records.records._sync.startSync()
  await records.records._sync.loadSubset({ limit: 51, offset: 0 })

  const first = client.execute({
    command: {
      propertyId: "first",
      rowId: "row-1",
      type: "cell.set",
      value: "A2",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  const second = client.execute({
    command: {
      propertyId: "second",
      rowId: "row-1",
      type: "cell.set",
      value: "B2",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  const firstFailure = assert.rejects(first.promise, /first failed/)
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.first?.value,
    "A2",
  )
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.second?.value,
    "B2",
  )

  await Promise.resolve()
  requests.get("first")?.reject(new Error("first failed"))
  await firstFailure
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.first?.value,
    "A",
  )
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.second?.value,
    "B2",
  )

  const secondRequest = requests.get("second")!
  const confirmed = recordWithValues({ first: "A", second: "B2" })
  secondRequest.resolve({
    commandId: secondRequest.commandId,
    event: sourceEvent(2, { records: [confirmed] }, {
      commandId: secondRequest.commandId,
    }),
    result: confirmed,
  })
  await second.promise
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.second?.value,
    "B2",
  )
  await client.cleanup()
})

test("a failed ordering command cancels dependent unsent moves and permits retry", async () => {
  const commandRequests: Array<{
    commandId: string
    reject(error: Error): void
    resolve(value: unknown): void
  }> = []
  const apiFetch: ApiFetcher = async (path, init) => {
    if (path.includes("/bootstrap")) return bootstrap(1) as never
    if (path.includes("/records?")) {
      return {
        databaseVersion: 1,
        dataSourceVersion: 1,
        hasMore: false,
        offset: 0,
        records: [
          record("row-1", "1024.0000000000"),
          record("row-2", "2048.0000000000"),
          record("row-3", "3072.0000000000"),
        ],
        snapshot: "snapshot-1",
        totalCount: 3,
      } as never
    }
    if (path.endsWith("/commands")) {
      const body = JSON.parse(String(init?.body)) as { commandId: string }
      return await new Promise<unknown>((resolve, reject) => {
        commandRequests.push({ commandId: body.commandId, reject, resolve })
      }) as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const records = client.getRecordCollection({
    databaseId: "database-1",
    dataSourceId: "source-1",
    viewId: "view-1",
  })
  records.records._sync.startSync()
  await records.records._sync.loadSubset({ limit: 51, offset: 0 })

  const first = client.execute({
    command: {
      afterRowId: "row-3",
      beforeRowId: null,
      rowId: "row-1",
      type: "row.move",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  const second = client.execute({
    command: {
      afterRowId: "row-1",
      beforeRowId: null,
      rowId: "row-2",
      type: "row.move",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  const firstFailure = assert.rejects(first.promise, /ordering conflict/)
  const secondFailure = assert.rejects(
    second.promise,
    (error: unknown) =>
      Boolean(error && typeof error === "object" &&
        "code" in error && error.code === "DEPENDENT_COMMAND_CANCELLED"),
  )
  assert.deepEqual(orderedRecordIds(records), ["row-3", "row-1", "row-2"])

  await Promise.resolve()
  assert.equal(commandRequests.length, 1)
  commandRequests[0]?.reject(new Error("ordering conflict"))
  await Promise.all([firstFailure, secondFailure])
  assert.equal(commandRequests.length, 1)
  assert.deepEqual(orderedRecordIds(records), ["row-1", "row-2", "row-3"])

  const retry = client.execute<DatabaseRecordEntity>({
    command: {
      afterRowId: "row-3",
      beforeRowId: null,
      rowId: "row-1",
      type: "row.move",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  await Promise.resolve()
  assert.equal(commandRequests.length, 2)
  const retried = record("row-1", "4096.0000000000")
  commandRequests[1]?.resolve({
    commandId: commandRequests[1]?.commandId,
    event: sourceEvent(2, { records: [retried] }, {
      commandId: commandRequests[1]?.commandId,
    }),
    result: retried,
  })
  await retry.promise
  assert.deepEqual(orderedRecordIds(records), ["row-2", "row-3", "row-1"])
  await client.cleanup()
})

test("out-of-order independent acknowledgements catch up without losing overlays", async () => {
  const requests = new Map<string, {
    commandId: string
    resolve(value: unknown): void
  }>()
  let secondEvent: DataSourceMutationEventV3 | undefined
  let firstEvent: DataSourceMutationEventV3 | undefined
  const paths: string[] = []
  const apiFetch: ApiFetcher = async (path, init) => {
    paths.push(path)
    if (path.includes("/records?")) {
      return {
        databaseVersion: 1,
        dataSourceVersion: 1,
        hasMore: false,
        offset: 0,
        records: [recordWithValues({ first: "A", second: "B" })],
        snapshot: "snapshot-1",
        totalCount: 1,
      } as never
    }
    if (path.includes("/mutations?")) {
      return {
        events: [firstEvent, secondEvent],
        hasMore: false,
        latestSourceVersion: 3,
        resetRequired: false,
      } as never
    }
    if (path.endsWith("/commands")) {
      const body = JSON.parse(String(init?.body)) as {
        command: { propertyId: string }
        commandId: string
      }
      return await new Promise<unknown>((resolve) => {
        requests.set(body.command.propertyId, {
          commandId: body.commandId,
          resolve,
        })
      }) as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const records = client.getRecordCollection({
    databaseId: "database-1",
    dataSourceId: "source-1",
    viewId: "view-1",
  })
  records.records._sync.startSync()
  await records.records._sync.loadSubset({ limit: 51, offset: 0 })

  const first = client.execute({
    command: {
      propertyId: "first",
      rowId: "row-1",
      type: "cell.set",
      value: "A2",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  const second = client.execute({
    command: {
      propertyId: "second",
      rowId: "row-1",
      type: "cell.set",
      value: "B2",
    },
    databaseId: "database-1",
    dataSourceId: "source-1",
  })
  await Promise.resolve()
  const firstRequest = requests.get("first")!
  const secondRequest = requests.get("second")!
  const afterFirst = recordWithValues({ first: "A2", second: "B" })
  const afterSecond = recordWithValues({ first: "A2", second: "B2" })
  firstEvent = sourceEvent(2, { records: [afterFirst] }, {
    commandId: firstRequest.commandId,
  })
  secondEvent = sourceEvent(3, { records: [afterSecond] }, {
    commandId: secondRequest.commandId,
  })

  secondRequest.resolve({
    commandId: secondRequest.commandId,
    event: secondEvent,
    result: afterSecond,
  })
  await second.promise
  assert.deepEqual(
    paths.filter((path) => path.includes("/mutations?")),
    ["/data-sources/source-1/mutations?afterVersion=1&limit=500"],
  )
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.first?.value,
    "A2",
  )
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.second?.value,
    "B2",
  )

  firstRequest.resolve({
    commandId: firstRequest.commandId,
    event: firstEvent,
    result: afterFirst,
  })
  await first.promise
  await client.ingest(secondEvent)
  assert.equal(
    records.records.state.get("row-1")?.valuesByPropertyId.second?.value,
    "B2",
  )
  assert.equal(paths.filter((path) => path.includes("/mutations?")).length, 1)
  await client.cleanup()
})

test("one source event patches every collection displaying that source", async () => {
  const apiFetch: ApiFetcher = async (path) => {
    if (path.includes("/records?")) {
      return {
        databaseVersion: 1,
        dataSourceVersion: 1,
        hasMore: false,
        offset: 0,
        records: [record("row-1", "1024.0000000000", "Original")],
        snapshot: "snapshot-1",
        totalCount: 1,
      } as never
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  const client = createDatabaseClient({
    apiFetch,
    queryClient: new QueryClient(),
    sessionId: "session-1",
  })
  const first = client.getRecordCollection({
    databaseId: "database-1",
    dataSourceId: "source-1",
    viewId: "view-1",
  })
  const second = client.getRecordCollection({
    databaseId: "database-2",
    dataSourceId: "source-1",
    viewId: "view-2",
  })
  first.records._sync.startSync()
  second.records._sync.startSync()
  await Promise.all([
    first.records._sync.loadSubset({ limit: 51, offset: 0 }),
    second.records._sync.loadSubset({ limit: 51, offset: 0 }),
  ])
  const changed = record("row-1", "1024.0000000000", "Shared update")
  const sharedEvent = sourceEvent(2, { records: [changed] }, {
    commandId: "shared-command",
    eventId: "source-event",
  })

  await client.ingest(sharedEvent)
  assert.equal(first.records.state.get("row-1")?.page.name, "Shared update")
  assert.equal(second.records.state.get("row-1")?.page.name, "Shared update")
  await client.ingest(sharedEvent)
  assert.equal(first.records.size, 1)
  assert.equal(second.records.size, 1)
  await client.cleanup()
})
