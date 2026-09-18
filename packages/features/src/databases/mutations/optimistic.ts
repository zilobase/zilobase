import type { QueryClient } from "@tanstack/react-query";

import {
  databaseBootstrapResponseSchema,
  databaseRecordWindowResponseSchema,
  type DatabaseBootstrapResponse,
  type DatabasePropertyEntity,
  type DatabaseRecordWindowResponse,
} from "../core/entities";
import { databaseQueryRoot } from "../queries/keys";
import { invalidateDatabaseQueries } from "./invalidate";
import { findDataSourceBootstrap } from "./scope";

/**
 * Targeted optimistic cache updates for database mutations.
 *
 * The poke-and-refetch client converges through POST + GET, which leaves a
 * visible stale window on production latency. These helpers patch the
 * QueryClient photocopy synchronously in `onMutate` so the UI reflects the
 * attempted edit instantly; the normal invalidation refetch then reconciles
 * with server truth, and `onError` rolls back via the returned closure.
 *
 * Version fields are never touched: pokes and prefer-newest guards keep
 * working on server versions, and the refetch overwrites the optimistic
 * values with committed data.
 */

export type OptimisticRollback = () => void;

export type OptimisticScope = {
  dataSourceId?: string;
  hostDatabaseId: string;
};

export type OptimisticContext = {
  rollback: OptimisticRollback;
  scope: OptimisticScope;
};

type HostQueryEntry = {
  data: unknown;
  queryKey: readonly unknown[];
};

function hostQueryEntries(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
): HostQueryEntry[] {
  return queryClient
    .getQueriesData({
      queryKey: [databaseQueryRoot, sessionId, hostDatabaseId],
    })
    .map(([queryKey, data]) => ({
      data,
      queryKey: queryKey as readonly unknown[],
    }));
}

function restoreEntries(
  queryClient: QueryClient,
  previous: HostQueryEntry[],
): OptimisticRollback {
  return () => {
    for (const { data, queryKey } of previous) {
      queryClient.setQueryData(queryKey, data);
    }
  };
}

/**
 * Resolve the canonical host (and source when known) from cache only. Never
 * fetches: returns null when nothing is cached, in which case callers skip
 * the optimistic patch and rely on the normal refetch.
 */
export function resolveOptimisticScope(
  queryClient: QueryClient,
  databaseOrSourceId: string,
  explicitHostDatabaseId?: string,
): OptimisticScope | null {
  if (explicitHostDatabaseId) {
    return { hostDatabaseId: explicitHostDatabaseId };
  }
  const sourceBootstrap = findDataSourceBootstrap(
    queryClient,
    databaseOrSourceId,
  );
  if (sourceBootstrap) {
    return {
      dataSourceId: databaseOrSourceId,
      hostDatabaseId: sourceBootstrap.database.id,
    };
  }
  for (
    const [, candidate] of queryClient.getQueriesData({
      queryKey: [databaseQueryRoot],
    })
  ) {
    const parsed = databaseBootstrapResponseSchema.safeParse(candidate);
    if (parsed.success && parsed.data.database.id === databaseOrSourceId) {
      return { hostDatabaseId: parsed.data.database.id };
    }
  }
  return null;
}

export async function cancelHostQueries(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
): Promise<void> {
  await queryClient.cancelQueries({
    queryKey: [databaseQueryRoot, sessionId, hostDatabaseId],
  });
}

/**
 * Refetch host queries after a failed optimistic mutation. Rollback alone
 * restores the pre-mutation cache, which is wrong when the write actually
 * committed but the response was lost (unconfirmed): only a refetch can
 * tell. Reconciliation failures are reported through the pending map by
 * invalidateDatabaseQueries itself.
 */
export function invalidateOptimisticHost(
  queryClient: QueryClient,
  sessionId: string,
  scope: OptimisticScope | null | undefined,
): void {
  if (!scope) return;
  try {
    invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
  } catch {
    // invalidateDatabaseQueries reports its own failures.
  }
}

/** First data-source id of a cached host bootstrap, if any. */
export function firstCachedDataSourceId(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
): string | null {
  for (const { data } of hostQueryEntries(queryClient, sessionId, hostDatabaseId)) {
    const parsed = databaseBootstrapResponseSchema.safeParse(data);
    if (parsed.success && parsed.data.dataSources.length > 0) {
      return parsed.data.dataSources[0]!.id;
    }
  }
  return null;
}

function patchWindowRecords(
  data: unknown,
  patch: (
    records: DatabaseRecordWindowResponse["records"],
  ) => DatabaseRecordWindowResponse["records"] | null,
): { changed: boolean; next: unknown } {
  const direct = databaseRecordWindowResponseSchema.safeParse(data);
  if (direct.success) {
    const records = patch(direct.data.records);
    if (!records) return { changed: false, next: data };
    return {
      changed: true,
      next: { ...direct.data, records },
    };
  }
  if (
    data && typeof data === "object" && "pages" in data &&
    Array.isArray((data as { pages?: unknown }).pages)
  ) {
    const holder = data as { pages: unknown[] } & Record<string, unknown>;
    let changed = false;
    const pages = holder.pages.map((page) => {
      const parsed = databaseRecordWindowResponseSchema.safeParse(page);
      if (!parsed.success) return page;
      const records = patch(parsed.data.records);
      if (!records) return page;
      changed = true;
      return { ...parsed.data, records };
    });
    if (!changed) return { changed: false, next: data };
    return { changed: true, next: { ...holder, pages } };
  }
  return { changed: false, next: data };
}

/** Optimistically set one cell value in every cached window holding the row. */
export function patchCachedCellValue(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
  input: {
    dataSourceId?: string;
    propertyId: string;
    rowId: string;
    value: unknown;
  },
): OptimisticRollback {
  const previous = hostQueryEntries(queryClient, sessionId, hostDatabaseId);
  const now = new Date().toISOString();
  for (const { data, queryKey } of previous) {
    const { changed, next } = patchWindowRecords(data, (records) => {
      let recordChanged = false;
      const nextRecords = records.map((record) => {
        if (record.id !== input.rowId) return record;
        if (input.dataSourceId && record.dataSourceId !== input.dataSourceId) {
          return record;
        }
        recordChanged = true;
        const existing = record.valuesByPropertyId[input.propertyId];
        return {
          ...record,
          valuesByPropertyId: {
            ...record.valuesByPropertyId,
            [input.propertyId]: {
              createdAt: existing?.createdAt ?? now,
              id: existing?.id ?? `${record.id}:${input.propertyId}`,
              pageId: existing?.pageId ?? record.pageId,
              propertyId: input.propertyId,
              updatedAt: now,
              value: input.value,
            },
          },
        };
      });
      return recordChanged ? nextRecords : null;
    });
    if (changed) queryClient.setQueryData(queryKey, next);
  }
  return restoreEntries(queryClient, previous);
}

function patchBootstraps(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
  patch: (
    bootstrap: DatabaseBootstrapResponse,
  ) => DatabaseBootstrapResponse | null,
): OptimisticRollback {
  const previous = hostQueryEntries(queryClient, sessionId, hostDatabaseId);
  for (const { data, queryKey } of previous) {
    const parsed = databaseBootstrapResponseSchema.safeParse(data);
    if (!parsed.success) continue;
    const next = patch(parsed.data);
    if (next) queryClient.setQueryData(queryKey, next);
  }
  return restoreEntries(queryClient, previous);
}

/** Optimistically rename / reconfigure the database host in cached bootstraps. */
export function patchCachedDatabase(
  queryClient: QueryClient,
  sessionId: string,
  databaseId: string,
  patch: { config?: unknown; name?: string },
): OptimisticRollback {
  return patchBootstraps(queryClient, sessionId, databaseId, (bootstrap) => {
    if (bootstrap.database.id !== databaseId) return null;
    return {
      ...bootstrap,
      database: {
        ...bootstrap.database,
        ...(patch.config !== undefined ? { config: patch.config } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
      },
    };
  });
}

/** Optimistically rename / reconfigure a view in cached bootstraps. */
export function patchCachedView(
  queryClient: QueryClient,
  sessionId: string,
  databaseId: string,
  viewId: string,
  patch: { config?: unknown; name?: string; type?: string },
): OptimisticRollback {
  return patchBootstraps(queryClient, sessionId, databaseId, (bootstrap) => {
    if (!bootstrap.views.some((view) => view.id === viewId)) return null;
    return {
      ...bootstrap,
      views: bootstrap.views.map((view) =>
        view.id === viewId
          ? {
            ...view,
            ...(patch.config !== undefined ? { config: patch.config } : {}),
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.type !== undefined ? { type: patch.type } : {}),
          }
          : view
      ),
    };
  });
}

/** Optimistically rename / reconfigure a property in cached bootstraps. */
export function patchCachedProperty(
  queryClient: QueryClient,
  sessionId: string,
  databaseId: string,
  propertyId: string,
  patch: {
    config?: unknown;
    name?: string;
    type?: string;
    visible?: boolean;
    width?: number | null;
  },
): OptimisticRollback {
  return patchBootstraps(queryClient, sessionId, databaseId, (bootstrap) => {
    if (!bootstrap.properties.some((property) => property.id === propertyId)) {
      return null;
    }
    return {
      ...bootstrap,
      properties: bootstrap.properties.map((property) => {
        if (property.id !== propertyId) return property;
        const nextProperty = { ...property.property };
        if (patch.name !== undefined) nextProperty.name = patch.name;
        if (patch.type !== undefined) nextProperty.type = patch.type;
        if (patch.config !== undefined) nextProperty.config = patch.config;
        return {
          ...property,
          ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
          ...(patch.width !== undefined ? { width: patch.width } : {}),
          property: nextProperty,
        };
      }),
    };
  });
}

let optimisticPropertyCounter = 0;

function workspaceIdForDataSource(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
  dataSourceId: string,
): string {
  for (const { data } of hostQueryEntries(queryClient, sessionId, hostDatabaseId)) {
    const parsed = databaseBootstrapResponseSchema.safeParse(data);
    if (!parsed.success) continue;
    const source = parsed.data.dataSources.find(({ id }) => id === dataSourceId);
    if (source) return source.workspaceId;
    if (parsed.data.dataSources.length > 0) {
      return parsed.data.dataSources[0]!.workspaceId;
    }
  }
  return "optimistic-workspace";
}

/**
 * Optimistically insert a property with a temporary id. The invalidation
 * refetch replaces it with the server-created entity; on error the rollback
 * removes it.
 */
export function insertOptimisticProperty(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
  input: {
    config?: unknown;
    dataSourceId: string;
    name: string;
    position?: number;
    type: string;
  },
): { propertyId: string; rollback: OptimisticRollback } {
  const propertyId =
    `optimistic-property-${Date.now().toString(36)}-${(optimisticPropertyCounter += 1)}`;
  const now = new Date().toISOString();
  const workspaceId = workspaceIdForDataSource(
    queryClient,
    sessionId,
    hostDatabaseId,
    input.dataSourceId,
  );
  const property: DatabasePropertyEntity = {
    createdAt: now,
    dataSourceId: input.dataSourceId,
    id: propertyId,
    position: input.position ?? Number.MAX_SAFE_INTEGER,
    property: {
      config: input.config ?? {},
      createdAt: now,
      id: propertyId,
      name: input.name,
      type: input.type,
      updatedAt: now,
      workspaceId,
    },
    propertyId,
    updatedAt: now,
    visible: true,
    width: null,
  };
  const rollback = patchBootstraps(
    queryClient,
    sessionId,
    hostDatabaseId,
    (bootstrap) => ({
      ...bootstrap,
      properties: [...bootstrap.properties, property],
    }),
  );
  return { propertyId, rollback };
}
