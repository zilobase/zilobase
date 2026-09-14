import { createCollection, useLiveInfiniteQuery } from "@tanstack/react-db"

import type { DatabaseRecordEntity } from "../contracts-v2"
import {
  SessionDatabaseClient,
  type DatabaseRecordWindow,
  type DatabaseViewScope,
} from "./database-client"
import { useOptionalDatabaseClient } from "./provider"
import {
  toDatabaseRecord,
  type WindowedDatabaseRecord,
} from "./record-collections"

const disabledRecordCollection = createCollection<WindowedDatabaseRecord>({
  getKey: ({ id }) => id,
  id: "database-client-v2:disabled-record-window",
  sync: {
    sync: ({ markReady }) => {
      markReady()
      return () => undefined
    },
  },
})

export type DatabaseRecordHookWindow = Omit<DatabaseRecordWindow, "scope"> & {
  scope: DatabaseViewScope | null
}

export function useDatabaseRecords(
  scope: DatabaseViewScope | null,
): DatabaseRecordHookWindow {
  const facade = useOptionalDatabaseClient()
  const sessionClient = facade instanceof SessionDatabaseClient ? facade : null
  const resource = scope && sessionClient
    ? sessionClient.getRecordCollection(scope)
    : null
  const collection = resource?.records ?? disabledRecordCollection
  const live = useLiveInfiniteQuery(
    (query) => query
      .from({ records: collection })
      .orderBy(({ records }) => records.__windowIndex, "asc"),
    {
      client: sessionClient?.tanstack,
      pageSize: resource?.pageSize ?? 50,
      queryKey: [resource?.descriptorId ?? "disabled-record-window", resource?.pageSize ?? 50],
    },
  )
  const metadata = resource?.getLatestWindow()

  if (!scope || !resource || !sessionClient) {
    return {
      error: null,
      fetchNextPage: async () => undefined,
      hasMore: false,
      isFetchingNextPage: false,
      pageSize: 50,
      records: [],
      scope: null,
      status: "idle",
      totalCount: 0,
    }
  }

  return {
    error: live.error instanceof Error
      ? live.error
      : live.error
        ? new Error(String(live.error))
        : null,
    fetchNextPage: live.fetchNextPage,
    hasMore: live.hasNextPage,
    isFetchingNextPage: live.isFetchingNextPage,
    pageSize: resource.pageSize,
    records: live.data.map(toDatabaseRecord) as DatabaseRecordEntity[],
    scope,
    status: live.isError
      ? "error"
      : live.isLoading
        ? "loading"
        : live.isReady
          ? "success"
          : "idle",
    totalCount: metadata?.totalCount ?? live.data.length,
  }
}
