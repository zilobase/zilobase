import { useLiveInfiniteQuery } from "@tanstack/react-db"

import type { DatabaseRecordEntity } from "../contracts-v2"
import {
  SessionDatabaseClient,
  type DatabaseRecordWindow,
  type DatabaseViewScope,
} from "./database-client"
import { useDatabaseClient } from "./provider"
import { toDatabaseRecord } from "./record-collections"

export function useDatabaseRecords(
  scope: DatabaseViewScope,
): DatabaseRecordWindow {
  const facade = useDatabaseClient()
  if (!(facade instanceof SessionDatabaseClient)) {
    throw new Error("Unsupported database client implementation")
  }
  const resource = facade.getRecordCollection(scope)
  const live = useLiveInfiniteQuery(
    (query) => query
      .from({ records: resource.records })
      .orderBy(({ records }) => records.__windowIndex, "asc"),
    {
      client: facade.tanstack,
      pageSize: resource.pageSize,
      queryKey: [resource.descriptorId, resource.pageSize],
    },
  )
  const metadata = resource.getLatestWindow()

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
