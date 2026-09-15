import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient } from "@tanstack/react-query"

import type {
  DatabaseBootstrapResponse,
  DatabaseRecordEntity,
  DatabaseRecordWindowResponse,
} from "../contracts-v2"
import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  createDatabaseClient,
} from "./database-client"
import { databaseBootstrapQueryKey } from "./bootstrap-collections"
import {
  createDatabaseRecordCollection,
  recordCollectionId,
} from "./record-collections"

const scope = {
  databaseId: "database-1",
  dataSourceId: "source-1",
  includeDeleted: true,
  viewId: "view-1",
}

function record(index: number): DatabaseRecordEntity {
  const timestamp = "2026-09-14T00:00:00.000Z"
  return {
    createdAt: timestamp,
    dataSourceId: "source-1",
    id: `row-${index}`,
    orderKey: `${(index + 1) * 1024}.0000000000`,
    page: {
      createdAt: timestamp,
      deletedAt: null,
      hasContent: false,
      id: `page-${index}`,
      metadata: {},
      name: `Row ${index}`,
      updatedAt: timestamp,
    },
    pageId: `page-${index}`,
    parentRowId: null,
    updatedAt: timestamp,
    valuesByPropertyId: {},
  }
}

function windowResponse(
  offset: number,
  limit: number,
  snapshot: string,
): DatabaseRecordWindowResponse {
  const totalCount = 80
  const count = Math.max(0, Math.min(limit, totalCount - offset))
  return {
    databaseVersion: 3,
    dataSourceVersion: 2,
    hasMore: offset + count < totalCount,
    offset,
    records: Array.from({ length: count }, (_, index) => record(offset + index)),
    snapshot,
    totalCount,
  }
}

test("record collections request exact growing windows and retain snapshots", async () => {
  const paths: string[] = []
  const apiFetch: ApiFetcher = async (path) => {
    paths.push(path)
    const url = new URL(path, "https://zilobase.test")
    return windowResponse(
      Number(url.searchParams.get("offset")),
      Number(url.searchParams.get("limit")),
      "snapshot-1",
    ) as never
  }
  const queryClient = new QueryClient()
  const resource = createDatabaseRecordCollection({
    apiFetch,
    pageSize: 25,
    queryClient,
    scope,
    sessionId: "session/one",
  })

  resource.records._sync.startSync()
  await resource.records._sync.loadSubset({ limit: 26, offset: 0 })
  await resource.records._sync.loadSubset({ limit: 51, offset: 0 })

  assert.deepEqual(paths, [
    "/databases/database-1/data-sources/source-1/records?limit=26&offset=0&viewId=view-1&includeDeleted=1",
    "/databases/database-1/data-sources/source-1/records?limit=51&offset=0&viewId=view-1&includeDeleted=1&snapshot=snapshot-1",
  ])
  assert.equal(resource.records.state.get("row-50")?.__windowIndex, 50)
  assert.equal(resource.getLatestWindow()?.hasMore, true)
  assert.equal(queryClient.getQueryCache().getAll().length, 2)
  resource.records._sync.unloadSubset({ limit: 26, offset: 0 })
  resource.records._sync.unloadSubset({ limit: 51, offset: 0 })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(queryClient.getQueryCache().getAll().length, 0)
  await resource.cleanup()
})

test("stale record windows restart cumulatively without the old snapshot", async () => {
  const paths: string[] = []
  const apiFetch: ApiFetcher = async (path) => {
    paths.push(path)
    const url = new URL(path, "https://zilobase.test")
    if (paths.length === 2) {
      throw {
        body: { code: "WINDOW_STALE" },
        status: 409,
      }
    }
    return windowResponse(
      Number(url.searchParams.get("offset")),
      Number(url.searchParams.get("limit")),
      paths.length === 1 ? "snapshot-old" : "snapshot-new",
    ) as never
  }
  const resource = createDatabaseRecordCollection({
    apiFetch,
    pageSize: 25,
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    scope: { ...scope, includeDeleted: false },
    sessionId: "session-1",
  })

  resource.records._sync.startSync()
  await resource.records._sync.loadSubset({ limit: 26, offset: 0 })
  await resource.records._sync.loadSubset({ limit: 26, offset: 25 })

  assert.equal(paths.length, 3)
  assert.match(paths[1] ?? "", /limit=26&offset=25/)
  assert.match(paths[1] ?? "", /snapshot=snapshot-old/)
  assert.match(paths[2] ?? "", /limit=51&offset=0/)
  assert.doesNotMatch(paths[2] ?? "", /snapshot=/)
  assert.equal(resource.getLatestWindow()?.snapshot, "snapshot-new")
  await resource.cleanup()
})

test("record descriptors and page sizes include the complete business scope", async () => {
  const queryClient = new QueryClient()
  const client = createDatabaseClient({
    apiFetch: async () => undefined as never,
    queryClient,
    sessionId: "session/one",
  })
  const bootstrap = {
    database: { config: { initialPageSize: 10 } },
    views: [{ config: { initialPageSize: 100 }, id: "view-1" }],
  } as DatabaseBootstrapResponse
  queryClient.setQueryData(
    databaseBootstrapQueryKey("session/one", scope),
    bootstrap,
  )

  assert.equal(client.getRecordPageSize(scope), 100)
  assert.equal(
    client.getRecordPageSize({ ...scope, viewId: "missing-view" }),
    50,
  )
  assert.equal(
    recordCollectionId("session/one", scope),
    "database-client-v2:session%2Fone:database-1:source-1:view-1:deleted:records",
  )
  assert.notEqual(
    recordCollectionId("session/one", scope),
    recordCollectionId("session/one", { ...scope, includeDeleted: false }),
  )
  await client.cleanup()
})

test("a realtime cell event directly updates a loaded record collection", async () => {
  const resource = createDatabaseRecordCollection({
    apiFetch: async () => windowResponse(0, 1, "snapshot-1") as never,
    pageSize: 25,
    queryClient: new QueryClient(),
    scope,
    sessionId: "session-1",
  })
  resource.records._sync.startSync()
  await resource.records._sync.loadSubset({ limit: 1, offset: 0 })
  let notifications = 0
  const subscription = resource.records.subscribeChanges(() => {
    notifications += 1
  }, { includeInitialState: false })
  const timestamp = "2026-09-15T00:00:00.000Z"
  const updated = {
    ...record(0),
    updatedAt: timestamp,
    valuesByPropertyId: {
      "property-status": {
        createdAt: timestamp,
        id: "value-1",
        pageId: "page-0",
        propertyId: "property-status",
        updatedAt: timestamp,
        value: "Done",
      },
    },
  }

  assert.equal(resource.apply({
    actorId: "collaborator-2",
    areas: ["records"],
    changes: { records: [updated] },
    commandId: "command-4",
    committedAt: timestamp,
    databaseId: scope.databaseId,
    dataSourceId: scope.dataSourceId,
    eventId: "event-4",
    protocolVersion: 2,
    type: "database.mutation",
    version: 4,
  }, false), "applied")
  assert.equal(
    resource.records.state.get("row-0")?.valuesByPropertyId[
      "property-status"
    ]?.value,
    "Done",
  )
  assert.ok(notifications > 0)

  subscription.unsubscribe()
  await resource.cleanup()
})
