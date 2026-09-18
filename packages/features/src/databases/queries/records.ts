import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import { useZilobaseFeatures, type ApiFetcher } from "../../shared/context";
import { useDatabaseSessionId } from "./session";
import {
  databaseRecordWindowResponseSchema,
  type DatabaseInitialPageSize,
  type DatabaseRecordEntity,
  type DatabaseRecordWindowResponse,
} from "../core/entities";
import { getDatabaseInitialPageSize } from "../views/view-evaluation";
import {
  cachedWindowMaxVersion,
  databaseBootstrapQueryKey,
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
  });
  if (scope.includeDeleted) query.set("includeDeleted", "1");
  if (window.snapshot) query.set("snapshot", window.snapshot);
  return `/databases/${encodeURIComponent(scope.databaseId)}` +
    `/data-sources/${encodeURIComponent(scope.dataSourceId)}` +
    `/records?${query.toString()}`;
}

export async function fetchRecordWindow(
  apiFetch: ApiFetcher,
  scope: DatabaseWindowFetchScope,
  window: RecordWindowPageParam,
  queryClient?: QueryClient,
  queryKey?: readonly unknown[],
): Promise<DatabaseRecordWindowResponse> {
  let incoming: DatabaseRecordWindowResponse;
  try {
    incoming = databaseRecordWindowResponseSchema.parse(
      await apiFetch<DatabaseRecordWindowResponse>(
        recordWindowPath(scope, window),
      ),
    );
  } catch (error) {
    if (!isWindowStaleError(error)) throw error;
    // Retry ONCE with snapshot cleared. If second fails, throw.
    incoming = databaseRecordWindowResponseSchema.parse(
      await apiFetch<DatabaseRecordWindowResponse>(
        recordWindowPath(scope, { limit: window.limit, snapshot: undefined }),
      ),
    );
  }
  // Prefer-newest guard: discard stale incoming when cache is newer.
  if (queryClient && queryKey) {
    const cachedMax = cachedWindowMaxVersion(queryClient, queryKey);
    if (incoming.databaseVersion < cachedMax) {
      const cached = queryClient.getQueryData<
        InfiniteData<DatabaseRecordWindowResponse>
      >(queryKey);
      const last = cached?.pages.at(-1);
      if (last) return last;
    }
  }
  return incoming;
}

export function isWindowStaleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    body?: { code?: unknown };
    code?: unknown;
    status?: unknown;
  };
  return candidate.code === "WINDOW_STALE" ||
    (candidate.status === 409 && candidate.body?.code === "WINDOW_STALE");
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

function resolvePageSize(
  queryClient: QueryClient,
  sessionId: string,
  scope: DatabaseViewScope,
): DatabaseInitialPageSize {
  const bootstrap = queryClient.getQueryData<{
    database: { config: unknown };
    views: Array<{ config: unknown; id: string }>;
  }>(databaseBootstrapQueryKey(sessionId, scope));
  const view = bootstrap?.views.find(
    (candidate) => candidate.id === scope.viewId,
  );
  return getDatabaseInitialPageSize(
    view?.config ?? bootstrap?.database.config,
  );
}

export function useDatabaseRecords(
  scope: DatabaseViewScope | null,
): DatabaseRecordHookWindow {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();

  // Keep key stable: use first resolved pageSize for this hook instance.
  // Changing view pageSize requires remount / view switch.
  const pageSizeRef = useRef<DatabaseInitialPageSize | null>(null);
  if (scope && pageSizeRef.current === null) {
    pageSizeRef.current = resolvePageSize(queryClient, sessionId, scope);
  }
  if (!scope && pageSizeRef.current === null) {
    pageSizeRef.current = 50;
  }
  const pageSize = pageSizeRef.current ?? 50;

  const queryKey = scope
    ? databaseWindowQueryKey(sessionId, scope)
    : null;

  const query = useInfiniteQuery<
    DatabaseRecordWindowResponse,
    Error,
    InfiniteData<DatabaseRecordWindowResponse>,
    ReturnType<typeof databaseWindowQueryKey>,
    RecordWindowPageParam
  >({
    enabled: Boolean(scope),
    initialPageParam: { limit: pageSize, snapshot: undefined },
    queryFn: async ({ pageParam }) => {
      if (!scope || !queryKey) {
        throw new Error("Database record scope is required");
      }
      return fetchRecordWindow(
        apiFetch,
        scope,
        pageParam,
        queryClient,
        queryKey,
      );
    },
    getNextPageParam: (last): RecordWindowPageParam | undefined =>
      last.hasMore
        ? {
          limit: last.records.length + pageSize,
          snapshot: last.snapshot,
        }
        : undefined,
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
          (previousQuery as { queryKey?: readonly unknown[] } | undefined)
            ?.queryKey,
          scope.dataSourceId,
        )
        : previousData,
    staleTime: 30_000,
  });

  if (!scope) {
    return {
      error: null,
      fetchNextPage: async () => undefined,
      hasMore: false,
      isFetching: false,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      pageSize: 50,
      records: [],
      scope: null,
      status: "idle",
      totalCount: 0,
    };
  }

  const latest = query.data?.pages.at(-1);
  const error = query.error instanceof Error
    ? query.error
    : query.error
      ? new Error(String(query.error))
      : null;

  return {
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
    status: query.isError
      ? "error"
      : query.isLoading
        ? "loading"
        : latest
          ? "success"
          : "idle",
    totalCount: latest?.totalCount ?? 0,
  };
}
