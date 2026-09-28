import {
  infiniteQueryOptions,
  useInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { useZilobaseFeatures, type ApiFetcher } from "../../shared/context";
import { useDatabaseSessionId } from "./session";
import {
  databaseRecordWindowResponseSchema,
  type DatabaseBootstrapResponse,
  type DatabaseInitialPageSize,
  type DatabaseRecordEntity,
  type DatabaseRecordWindowResponse,
} from "../core/entities";
import { getDatabaseInitialPageSize } from "../views/view-evaluation";
import { databaseViewQueryHash } from "../views/query-hash";
import {
  cachedWindowMaxVersion,
  databaseWindowQueryKey,
  type DatabaseBootstrapScope,
  type DatabaseWindowScope,
} from "./keys";

export type DatabaseViewScope = DatabaseBootstrapScope & {
  dataSourceId: string;
  queryHash: string;
  viewId: string;
};

/** Fetch-time scope: the cache key is the query hash, viewId selects the
 *  server-side evaluation for that hash. Sibling views with equal hashes
 *  share one cached window. */
export type DatabaseWindowFetchScope = DatabaseWindowScope & {
  viewId: string;
};

export type DatabaseRecordHookWindow = {
  databaseVersion: number | null;
  dataSourceVersion: number | null;
  error: Error | null;
  fetchNextPage: () => Promise<void>;
  hasMore: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isPlaceholderData: boolean;
  pageSize: DatabaseInitialPageSize;
  records: DatabaseRecordEntity[];
  scope: DatabaseViewScope | null;
  status: "idle" | "loading" | "success" | "error";
  totalCount: number;
};

export type RecordWindowPageParam = {
  limit: number;
  snapshot: string | undefined;
};

export function recordWindowPath(
  scope: DatabaseWindowFetchScope,
  window: RecordWindowPageParam,
): string {
  const query = new URLSearchParams({
    limit: String(window.limit),
    offset: "0",
    viewId: scope.viewId,
    expectedQueryHash: scope.queryHash,
  });
  if (scope.includeDeleted) query.set("includeDeleted", "1");
  if (window.snapshot) query.set("snapshot", window.snapshot);
  return (
    `/databases/${encodeURIComponent(scope.databaseId)}` +
    `/data-sources/${encodeURIComponent(scope.dataSourceId)}` +
    `/records?${query.toString()}`
  );
}

export async function fetchRecordWindow(
  apiFetch: ApiFetcher,
  scope: DatabaseWindowFetchScope,
  window: RecordWindowPageParam,
  queryClient?: QueryClient,
  queryKey?: readonly unknown[],
  signal?: AbortSignal,
): Promise<DatabaseRecordWindowResponse> {
  const read = async (page: RecordWindowPageParam) => {
    try {
      const response = databaseRecordWindowResponseSchema.parse(
        await apiFetch<DatabaseRecordWindowResponse>(recordWindowPath(scope, page), { signal }),
      );
      if (response.queryHash !== scope.queryHash) throw new DatabaseViewQueryChangedError();
      return response;
    } catch (error) {
      if (!isViewQueryChangedError(error)) throw error;
      // The old hash must never receive rows evaluated using a newer saved view.
      // Refresh metadata so every consumer can switch to the confirmed query key.
      if (queryClient && queryKey)
        void queryClient
          .invalidateQueries({
            queryKey: ["db", queryKey[1], scope.databaseId, "bootstrap"],
          })
          .catch(() => undefined);
      throw new DatabaseViewQueryChangedError();
    }
  };
  let incoming: DatabaseRecordWindowResponse;
  try {
    incoming = await read(window);
  } catch (error) {
    if (!isWindowStaleError(error)) throw error;
    // Retry ONCE with snapshot cleared. If second fails, throw.
    incoming = await read({ limit: window.limit, snapshot: undefined });
  }
  // Prefer-newest guard: discard stale incoming when cache is newer.
  if (queryClient && queryKey) {
    const cachedMax = cachedWindowMaxVersion(queryClient, queryKey);
    if (incoming.databaseVersion < cachedMax) {
      const cached = queryClient.getQueryData<InfiniteData<DatabaseRecordWindowResponse>>(queryKey);
      const last = cached?.pages.at(-1);
      if (last) return last;
    }
  }
  return incoming;
}

export class DatabaseViewQueryChangedError extends Error {
  readonly code = "VIEW_QUERY_CHANGED";
  constructor() {
    super("The saved database view query has changed; refresh its configuration");
    this.name = "DatabaseViewQueryChangedError";
  }
}

function isViewQueryChangedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; body?: { code?: unknown } };
  return (
    candidate.code === "VIEW_QUERY_CHANGED" ||
    (candidate.status === 409 && candidate.body?.code === "VIEW_QUERY_CHANGED")
  );
}

export function isWindowStaleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    body?: { code?: unknown };
    code?: unknown;
    status?: unknown;
  };
  return (
    candidate.code === "WINDOW_STALE" ||
    (candidate.status === 409 && candidate.body?.code === "WINDOW_STALE")
  );
}

/**
 * Keep the previous window visible while a new query hash loads, but only
 * within one data source: rows from another source have a different schema
 * and must not flash in the new view. Returning undefined falls back to the
 * loading state (skeleton on true cold load).
 *
 * Window key: ["db", session, host, "window", dataSourceId, queryHash, …].
 */
export function selectSameSourcePlaceholder<Data>(
  previousData: Data | undefined,
  previousKey: readonly unknown[] | undefined,
  dataSourceId: string,
): Data | undefined {
  if (Array.isArray(previousKey) && previousKey[4] === dataSourceId) {
    return previousData;
  }
  return undefined;
}

export function databaseWindowQueryOptions(
  apiFetch: ApiFetcher,
  sessionId: string,
  scope: DatabaseWindowFetchScope,
  pageSize: DatabaseInitialPageSize,
  queryClient?: QueryClient,
) {
  const queryKey = databaseWindowQueryKey(sessionId, scope);
  return infiniteQueryOptions({
    queryKey,
    staleTime: 30_000,
    retry: (failures, error) => !isViewQueryChangedError(error) && failures < 2,
    initialPageParam: { limit: pageSize, snapshot: undefined },
    queryFn: async ({ pageParam, signal }): Promise<DatabaseRecordWindowResponse> =>
      fetchRecordWindow(apiFetch, scope, pageParam, queryClient, queryKey, signal),
    getNextPageParam: (last: DatabaseRecordWindowResponse): RecordWindowPageParam | undefined =>
      last.hasMore
        ? {
            limit: last.records.length + pageSize,
            snapshot: last.snapshot,
          }
        : undefined,
  });
}

/**
 * Warm the cache for a view the user has not opened yet. Skips when any
 * data is cached: staleness is handled by the opening query itself.
 */
export async function prefetchDatabaseWindow(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  sessionId: string,
  scope: DatabaseWindowFetchScope,
  pageSize: DatabaseInitialPageSize,
): Promise<void> {
  const queryKey = databaseWindowQueryKey(sessionId, scope);
  if (queryClient.getQueryData(queryKey) !== undefined) return;
  await queryClient.prefetchInfiniteQuery(
    databaseWindowQueryOptions(apiFetch, sessionId, scope, pageSize, queryClient),
  );
}

/** Select untouched, session-scoped metadata, never an optimistic view projection. */
export function confirmedWindowBootstrap(
  queryClient: QueryClient,
  sessionId: string,
  scope: Omit<DatabaseViewScope, "queryHash"> | null,
): DatabaseBootstrapResponse | undefined {
  if (!scope) return undefined;
  let newest: DatabaseBootstrapResponse | undefined;
  for (const [key, bootstrap] of queryClient.getQueriesData<DatabaseBootstrapResponse>({
    queryKey: ["db", sessionId, scope.databaseId, "bootstrap"],
  })) {
    if (key[5] !== (scope.includeDeleted === true) || !bootstrap) continue;
    if (bootstrap.database.id !== scope.databaseId) continue;
    if (!newest || bootstrap.database.version > newest.database.version) newest = bootstrap;
  }
  return newest;
}

export function useDatabaseRecords(
  requestedScope: Omit<DatabaseViewScope, "queryHash"> | null,
): DatabaseRecordHookWindow {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  const hostId = requestedScope?.databaseId;
  const subscribe = useCallback(
    (notify: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey;
        // Observer registration and record-query creation can occur during another
        // component's render. Only actual metadata changes affect this snapshot.
        if (
          (event.type === "updated" || event.type === "removed") &&
          key[0] === "db" &&
          key[1] === sessionId &&
          key[2] === hostId &&
          key[3] === "bootstrap"
        )
          notify();
      }),
    [queryClient, sessionId, hostId],
  );
  const getSnapshot = () => confirmedWindowBootstrap(queryClient, sessionId, requestedScope);
  const bootstrap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const view = bootstrap?.views.find(
    ({ id, dataSourceId }) =>
      id === requestedScope?.viewId && dataSourceId === requestedScope.dataSourceId,
  );
  const scope =
    requestedScope && view
      ? {
          ...requestedScope,
          queryHash: databaseViewQueryHash(
            view.config ?? bootstrap?.database.config,
            requestedScope.includeDeleted,
          ),
        }
      : null;
  const pageSize = getDatabaseInitialPageSize(view?.config ?? bootstrap?.database.config);

  const queryKey = scope ? databaseWindowQueryKey(sessionId, scope) : null;

  const options = infiniteQueryOptions({
    ...databaseWindowQueryOptions(
      apiFetch,
      sessionId,
      scope ?? {
        databaseId: "disabled",
        dataSourceId: "disabled",
        queryHash: "disabled",
        viewId: "disabled",
      },
      pageSize,
      queryClient,
    ),
    enabled: Boolean(scope),
    queryKey: (queryKey ??
      databaseWindowQueryKey(sessionId, {
        databaseId: "disabled",
        dataSourceId: "disabled",
        queryHash: "disabled",
      })) as ReturnType<typeof databaseWindowQueryKey>,
    placeholderData: (previousData, previousQuery) =>
      scope
        ? selectSameSourcePlaceholder(
            previousData,
            (previousQuery as { queryKey?: readonly unknown[] } | undefined)?.queryKey,
            scope.dataSourceId,
          )
        : previousData,
    staleTime: 30_000,
  });
  const query = useInfiniteQuery(options);

  if (!scope) {
    return {
      databaseVersion: null,
      dataSourceVersion: null,
      error: null,
      fetchNextPage: async () => undefined,
      hasMore: false,
      isFetching: false,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      pageSize: 50,
      records: [],
      scope: null,
      status: requestedScope ? "loading" : "idle",
      totalCount: 0,
    };
  }

  const latest = query.data?.pages.at(-1);
  const error =
    query.error instanceof Error
      ? query.error
      : query.error
        ? new Error(String(query.error))
        : null;

  return {
    dataSourceVersion: query.isPlaceholderData ? null : (latest?.dataSourceVersion ?? null),
    databaseVersion: query.isPlaceholderData ? null : (latest?.databaseVersion ?? null),
    error,
    fetchNextPage: async () => {
      await query.fetchNextPage();
    },
    hasMore: latest?.hasMore ?? false,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isPlaceholderData: query.isPlaceholderData,
    pageSize,
    records: latest?.records ?? [],
    scope,
    status: query.isError ? "error" : query.isLoading ? "loading" : latest ? "success" : "idle",
    totalCount: latest?.totalCount ?? 0,
  };
}
