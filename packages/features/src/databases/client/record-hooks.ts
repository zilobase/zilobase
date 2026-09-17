import {
  BasicIndex,
  createCollection,
  useLiveInfiniteQuery,
} from "@tanstack/react-db"
import {
  useInfiniteQuery,
  type InfiniteData,
} from "@tanstack/react-query"

import {
  type DatabaseBootstrapResponse,
  databaseRecordWindowResponseSchema,
  type DatabaseRecordEntity,
  type DatabaseRecordWindowResponse,
} from  "../core/entities"
import { getDatabaseInitialPageSize } from  "../views/view-evaluation"
import type { ApiFetcher } from "../../shared/api-fetcher"
import { useZilobaseFeatures } from "../../shared/context"
import {
  SessionDatabaseClient,
  type DatabaseRecordWindow,
  type DatabaseViewScope,
} from "./db-client"
import { useOptionalDatabaseClient } from "./provider"
import {
  databaseBootstrapQueryKey,
  type BootstrapScope,
} from "./bootstrap-collections"
import { databaseClientQueryKey } from "./query-keys"
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
disabledRecordCollection.createIndex(
  (record) => record.__windowIndex,
  { indexType: BasicIndex },
)

export type DatabaseRecordHookWindow = Omit<DatabaseRecordWindow, "scope"> & {
  scope: DatabaseViewScope | null
}

type PublicRecordPageParam = {
  limit: number
  snapshot: string | undefined
}

export function useDatabaseRecords(
  scope: DatabaseViewScope | null,
): DatabaseRecordHookWindow {
  const facade = useOptionalDatabaseClient()
  const { apiFetch, queryClient } = useZilobaseFeatures()
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
  const publicBootstrap = scope && !sessionClient
    ? queryClient.getQueryData<DatabaseBootstrapResponse>(
        databaseBootstrapQueryKey("public", scope as BootstrapScope),
      )
    : undefined
  const publicView = publicBootstrap?.views.find(({ id }) => id === scope?.viewId)
  const publicPageSize = getDatabaseInitialPageSize(
    publicView?.config ?? publicBootstrap?.database.config,
  )
  const publicWindow = useInfiniteQuery<
    DatabaseRecordWindowResponse,
    Error,
    InfiniteData<DatabaseRecordWindowResponse>,
    ReturnType<typeof databaseClientQueryKey>,
    PublicRecordPageParam
  >({
    enabled: Boolean(scope) && !sessionClient,
    initialPageParam: {
      limit: publicPageSize,
      snapshot: undefined,
    } as PublicRecordPageParam,
    queryFn: async ({ pageParam }) => {
      if (!scope) throw new Error("Database record scope is required")
      try {
        return await fetchPublicRecordWindow(apiFetch, scope, pageParam)
      } catch (error) {
        if (!isWindowStaleError(error)) throw error
        return fetchPublicRecordWindow(apiFetch, scope, {
          limit: pageParam.limit,
          snapshot: undefined,
        })
      }
    },
    getNextPageParam: (last): PublicRecordPageParam | undefined => last.hasMore
      ? {
          limit: last.records.length + publicPageSize,
          snapshot: last.snapshot,
        }
      : undefined,
    queryKey: scope
      ? databaseClientQueryKey(
          "public",
          "records",
          scope.databaseId,
          scope.dataSourceId,
          scope.viewId,
          scope.includeDeleted === true,
        )
      : databaseClientQueryKey("public", "records", "disabled"),
  })

  if (!scope) {
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

  if (!resource || !sessionClient) {
    const latest = publicWindow.data?.pages.at(-1)
    return {
      error: publicWindow.error instanceof Error
        ? publicWindow.error
        : publicWindow.error
          ? new Error(String(publicWindow.error))
          : null,
      fetchNextPage: async () => {
        await publicWindow.fetchNextPage()
      },
      hasMore: latest?.hasMore ?? false,
      isFetchingNextPage: publicWindow.isFetchingNextPage,
      pageSize: publicPageSize,
      records: latest?.records ?? [],
      scope,
      status: publicWindow.isError
        ? "error"
        : publicWindow.isLoading
          ? "loading"
          : latest
            ? "success"
            : "idle",
      totalCount: latest?.totalCount ?? 0,
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

async function fetchPublicRecordWindow(
  apiFetch: ApiFetcher,
  scope: DatabaseViewScope,
  window: PublicRecordPageParam,
): Promise<DatabaseRecordWindowResponse> {
  const query = new URLSearchParams({
    limit: String(window.limit),
    offset: "0",
    viewId: scope.viewId,
  })
  if (scope.includeDeleted) query.set("includeDeleted", "1")
  if (window.snapshot) query.set("snapshot", window.snapshot)
  return databaseRecordWindowResponseSchema.parse(
    await apiFetch<DatabaseRecordWindowResponse>(
      `/databases/${encodeURIComponent(scope.databaseId)}` +
        `/data-sources/${encodeURIComponent(scope.dataSourceId)}` +
        `/records?${query.toString()}`,
    ),
  )
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
