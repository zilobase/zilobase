import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query"
import {
  BasicIndex,
  createCollection,
  type Collection,
} from "@tanstack/react-db"
import {
  queryCollectionOptions,
  type QueryCollectionUtils,
} from "@tanstack/query-db-collection"
import { z } from "zod"

import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  databaseRecordEntitySchema,
  databaseRecordWindowResponseSchema,
  type DatabaseInitialPageSize,
  type DatabaseMutationEventV2,
  type DataSourceMutationEventV3,
  type DatabaseRecordEntity,
  type DatabaseRecordWindowResponse,
} from "../contracts-v2"
import { parseDatabaseOrderKey } from "../order-key"
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
  __windowIndex: z.number().finite(),
})

export type DatabaseRecordCollection = {
  readonly descriptorId: string
  readonly pageSize: DatabaseInitialPageSize
  readonly scope: RecordCollectionScope
  records: Collection<WindowedDatabaseRecord, string>
  applyCellOverlay(input: {
    commandId: string
    propertyId: string
    rowId: string
    value: unknown
  }): boolean
  apply(
    event: DatabaseMutationEventV2 | DataSourceMutationEventV3,
    sortByOrderKey: boolean,
  ): DatabaseRecordApplyOutcome
  cleanup(): Promise<void>
  getLatestWindow(): DatabaseRecordWindowResponse | undefined
  reset(): Promise<void>
  settleCellOverlay(commandId: string): void
}

export type DatabaseRecordApplyOutcome =
  | "applied"
  | "collection_unavailable"
  | "no_record_changes"
  | "source_mismatch"

type CellOverlay = {
  commandId: string
  propertyId: string
  value: unknown
}

type RecordCellOverlays = {
  base: WindowedDatabaseRecord
  overlays: CellOverlay[]
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
  const cellOverlays = new Map<string, RecordCellOverlays>()
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
    select: (response) => response.records.map((record, index) => {
      const directIndex = (record as DatabaseRecordEntity & {
        __windowIndex?: unknown
      }).__windowIndex
      return {
        ...record,
        __windowIndex: Number.isSafeInteger(directIndex)
          ? Number(directIndex)
          : response.offset + index,
      }
    }),
    staleTime: 30_000,
    syncMode: "on-demand",
  }) as never) as unknown as Collection<WindowedDatabaseRecord, string>
  records.createIndex(
    (record) => record.__windowIndex,
    { indexType: BasicIndex },
  )

  return {
    descriptorId,
    pageSize: options.pageSize,
    scope: options.scope,
    records,
    applyCellOverlay(input) {
      const current = records.state.get(input.rowId)
      if (!current || records.status === "cleaned-up") return false
      let state = cellOverlays.get(input.rowId)
      if (!state) {
        state = {
          base: withoutVirtualProperties(current),
          overlays: [],
        }
        cellOverlays.set(input.rowId, state)
      }
      state.overlays.push(input)
      writeRecordUpserts(records, [projectCellOverlays(state)])
      updateLatestRecord(projectCellOverlays(state))
      return true
    },
    apply(event, sortByOrderKey) {
      if (records.status === "idle" || records.status === "cleaned-up") {
        return "collection_unavailable"
      }
      if (
        !event.changes.records?.length &&
        !event.changes.removedRecordIds?.length
      ) return "no_record_changes"
      const eventSourceId = event.protocolVersion === 3
        ? event.sourceId
        : event.dataSourceId
      if (eventSourceId && eventSourceId !== options.scope.dataSourceId) {
        return "source_mismatch"
      }
      const incomingRecords = (event.changes.records ?? []).filter(
        (entity) => entity.dataSourceId === options.scope.dataSourceId,
      )
      if (
        event.changes.records?.length &&
        incomingRecords.length === 0 &&
        !event.changes.removedRecordIds?.length
      ) return "source_mismatch"
      const removed = new Set(event.changes.removedRecordIds ?? [])
      for (const id of removed) cellOverlays.delete(id)
      const current = new Map<string, WindowedDatabaseRecord>(
        [...records._state.syncedData].map(([id, record]) => [
          id,
          withoutVirtualProperties(record),
        ]),
      )
      for (const [id, state] of cellOverlays) current.set(id, state.base)
      const removedLoaded = [...removed].filter((id) =>
        records._state.syncedData.has(id))
      for (const id of removed) current.delete(id)

      let nextIndex = Math.max(
        -1,
        ...[...current.values()].map((record) => record.__windowIndex),
      ) + 1
      let added = 0
      for (const entity of incomingRecords) {
        const existing = current.get(entity.id)
        const overlayState = cellOverlays.get(entity.id)
        if (overlayState) {
          overlayState.base = {
            ...entity,
            __windowIndex: existing?.__windowIndex ??
              overlayState.base.__windowIndex,
          }
        }
        if (!existing) added += 1
        current.set(
          entity.id,
          overlayState
            ? projectCellOverlays(overlayState)
            : {
                ...entity,
                __windowIndex: existing?.__windowIndex ?? nextIndex++,
              },
        )
      }
      for (const [id, state] of cellOverlays) {
        if (current.has(id)) current.set(id, projectCellOverlays(state))
      }

      const ordered = [...current.values()]
      if (sortByOrderKey) {
        ordered.sort((left, right) => {
          const difference = parseDatabaseOrderKey(left.orderKey) -
            parseDatabaseOrderKey(right.orderKey)
          return difference < 0n
            ? -1
            : difference > 0n
              ? 1
              : left.id.localeCompare(right.id)
        })
      } else {
        ordered.sort((left, right) =>
          left.__windowIndex - right.__windowIndex ||
          left.id.localeCompare(right.id))
      }
      const reindexed = ordered.map((entity, index) => {
        const overlayState = cellOverlays.get(entity.id)
        if (overlayState) {
          overlayState.base = {
            ...overlayState.base,
            __windowIndex: index,
          }
          return projectCellOverlays(overlayState)
        }
        return { ...entity, __windowIndex: index }
      })
      writeRecordChanges(records, reindexed, removedLoaded)

      if (latestWindow) {
        latestWindow = {
          ...latestWindow,
          ...(event.protocolVersion === 3
            ? { dataSourceVersion: event.sourceVersion }
            : {}),
          records: reindexed.map(toDatabaseRecord),
          totalCount: Math.max(
            0,
            latestWindow.totalCount + added - removedLoaded.length,
          ),
        }
      }
      return "applied"
    },
    cleanup: () => records.cleanup(),
    getLatestWindow: () => latestWindow,
    async reset() {
      snapshot = undefined
      latestWindow = undefined
      if (records.status === "idle" || records.status === "cleaned-up") return
      const utils = records.utils as unknown as QueryCollectionUtils<
        WindowedDatabaseRecord,
        string
      >
      await utils.refetch()
      for (const [rowId, state] of cellOverlays) {
        const canonical = records._state.syncedData.get(rowId)
        if (!canonical) {
          cellOverlays.delete(rowId)
          continue
        }
        state.base = withoutVirtualProperties(canonical)
        writeRecordUpserts(records, [projectCellOverlays(state)])
      }
    },
    settleCellOverlay(commandId) {
      for (const [rowId, state] of cellOverlays) {
        const next = state.overlays.filter(
          (overlay) => overlay.commandId !== commandId,
        )
        if (next.length === state.overlays.length) continue
        state.overlays = next
        const projected = projectCellOverlays(state)
        writeRecordUpserts(records, [projected])
        updateLatestRecord(projected)
        if (next.length === 0) cellOverlays.delete(rowId)
      }
    },
  }

  function updateLatestRecord(record: WindowedDatabaseRecord) {
    if (!latestWindow) return
    latestWindow = {
      ...latestWindow,
      records: latestWindow.records.map((candidate) =>
        candidate.id === record.id ? toDatabaseRecord(record) : candidate),
    }
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
  const { __windowIndex: _windowIndex, ...entity } =
    withoutVirtualProperties(record)
  return entity
}

function withoutVirtualProperties(record: WindowedDatabaseRecord) {
  const entity = { ...record } as WindowedDatabaseRecord & Record<string, unknown>
  delete entity.$synced
  delete entity.$origin
  delete entity.$key
  delete entity.$collectionId
  return entity
}

function projectCellOverlays(state: RecordCellOverlays) {
  let record = state.base
  for (const overlay of state.overlays) {
    const existing = record.valuesByPropertyId[overlay.propertyId]
    const updatedAt = new Date().toISOString()
    record = {
      ...record,
      valuesByPropertyId: {
        ...record.valuesByPropertyId,
        [overlay.propertyId]: {
          createdAt: existing?.createdAt ?? updatedAt,
          id: existing?.id ?? `optimistic-${overlay.commandId}`,
          pageId: record.pageId,
          propertyId: overlay.propertyId,
          updatedAt,
          value: overlay.value,
        },
      },
    }
  }
  return record
}

function writeRecordChanges(
  records: DatabaseRecordCollection["records"],
  upserts: WindowedDatabaseRecord[],
  removals: string[],
) {
  const utils = records.utils as unknown as QueryCollectionUtils<
    WindowedDatabaseRecord,
    string
  >
  utils.writeBatch(() => {
    if (removals.length > 0) utils.writeDelete(removals)
    if (upserts.length > 0) utils.writeUpsert(upserts)
  })
}

function writeRecordUpserts(
  records: DatabaseRecordCollection["records"],
  upserts: WindowedDatabaseRecord[],
) {
  writeRecordChanges(records, upserts, [])
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
