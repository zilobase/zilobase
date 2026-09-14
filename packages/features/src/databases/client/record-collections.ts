import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query"
import { createCollection, type Collection } from "@tanstack/react-db"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { z } from "zod"

import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  databaseRecordEntitySchema,
  databaseRecordWindowResponseSchema,
  type DatabaseInitialPageSize,
  type DatabaseRecordEntity,
  type DatabaseRecordWindowResponse,
} from "../contracts-v2"
import { databaseClientQueryKey } from "./query-keys"

export type RecordCollectionScope = {
  databaseId: string
  dataSourceId: string
  includeDeleted?: boolean
  viewId: string
}

export type WindowedDatabaseRecord = DatabaseRecordEntity & {
  __windowIndex: number
}

const windowedDatabaseRecordSchema = databaseRecordEntitySchema.extend({
  __windowIndex: z.number().int().nonnegative(),
})

export type DatabaseRecordCollection = {
  readonly descriptorId: string
  readonly pageSize: DatabaseInitialPageSize
  records: Collection<WindowedDatabaseRecord, string>
  cleanup(): Promise<void>
  getLatestWindow(): DatabaseRecordWindowResponse | undefined
}

export function createDatabaseRecordCollection(options: {
  apiFetch: ApiFetcher
  pageSize: DatabaseInitialPageSize
  queryClient: QueryClient
  scope: RecordCollectionScope
  sessionId: string
}): DatabaseRecordCollection {
  let snapshot: string | undefined
  let latestWindow: DatabaseRecordWindowResponse | undefined
  const descriptorId = recordCollectionId(options.sessionId, options.scope)
  const queryKey = databaseClientQueryKey(
    options.sessionId,
    "records",
    options.scope.databaseId,
    options.scope.dataSourceId,
    options.scope.viewId,
    options.scope.includeDeleted === true,
  )
  const queryFn = async (context: QueryFunctionContext) => {
    const request = readWindowRequest(
      context.meta?.loadSubsetOptions,
      options.pageSize,
    )
    try {
      const response = await fetchRecordWindow(options, request, snapshot)
      snapshot = response.snapshot
      latestWindow = response
      return response
    } catch (error) {
      if (!isWindowStaleError(error)) throw error
      snapshot = undefined
      const response = await fetchRecordWindow(options, {
        limit: request.offset + request.limit,
        offset: 0,
      })
      snapshot = response.snapshot
      latestWindow = response
      return response
    }
  }
  const records = createCollection(queryCollectionOptions({
    gcTime: 0,
    getKey: (record: WindowedDatabaseRecord) => record.id,
    id: descriptorId,
    queryClient: options.queryClient,
    queryFn,
    queryKey,
    schema: windowedDatabaseRecordSchema,
    select: (response) => response.records.map((record, index) => ({
      ...record,
      __windowIndex: response.offset + index,
    })),
    staleTime: 30_000,
    syncMode: "on-demand",
  }) as never) as unknown as Collection<WindowedDatabaseRecord, string>

  return {
    descriptorId,
    pageSize: options.pageSize,
    records,
    cleanup: () => records.cleanup(),
    getLatestWindow: () => latestWindow,
  }
}

export function recordCollectionId(
  sessionId: string,
  scope: RecordCollectionScope,
) {
  return [
    "database-client-v2",
    encodeURIComponent(sessionId),
    encodeURIComponent(scope.databaseId),
    encodeURIComponent(scope.dataSourceId),
    encodeURIComponent(scope.viewId),
    scope.includeDeleted === true ? "deleted" : "active",
    "records",
  ].join(":")
}

export function toDatabaseRecord(record: WindowedDatabaseRecord) {
  const { __windowIndex: _windowIndex, ...entity } = record
  return entity
}

function readWindowRequest(
  value: unknown,
  pageSize: DatabaseInitialPageSize,
) {
  const options = value && typeof value === "object"
    ? value as { limit?: unknown; offset?: unknown }
    : {}
  return {
    limit: Number.isSafeInteger(options.limit) && Number(options.limit) > 0
      ? Number(options.limit)
      : pageSize + 1,
    offset: Number.isSafeInteger(options.offset) && Number(options.offset) >= 0
      ? Number(options.offset)
      : 0,
  }
}

async function fetchRecordWindow(
  options: {
    apiFetch: ApiFetcher
    scope: RecordCollectionScope
  },
  request: { limit: number; offset: number },
  snapshot?: string,
) {
  const query = new URLSearchParams({
    limit: String(request.limit),
    offset: String(request.offset),
    viewId: options.scope.viewId,
  })
  if (options.scope.includeDeleted) query.set("includeDeleted", "1")
  if (snapshot) query.set("snapshot", snapshot)
  const response = await options.apiFetch<DatabaseRecordWindowResponse>(
    `/databases/${encodeURIComponent(options.scope.databaseId)}` +
      `/data-sources/${encodeURIComponent(options.scope.dataSourceId)}` +
      `/records?${query.toString()}`,
  )
  return databaseRecordWindowResponseSchema.parse(response)
}

function isWindowStaleError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const candidate = error as {
    body?: { code?: unknown }
    code?: unknown
    status?: unknown
  }
  return candidate.code === "WINDOW_STALE" ||
    (candidate.status === 409 && candidate.body?.code === "WINDOW_STALE")
}
