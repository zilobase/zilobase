import type { QueryClient } from "@tanstack/react-query"
import { createCollection, type Collection } from "@tanstack/react-db"
import {
  queryCollectionOptions,
  type QueryCollectionUtils,
} from "@tanstack/query-db-collection"

import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  databaseBootstrapResponseSchema,
  databaseHostEntitySchema,
  databasePropertyEntitySchema,
  databaseViewEntitySchema,
  dataSourceEntitySchema,
  type DatabaseBootstrapResponse,
  type DatabaseHostEntity,
  type DatabaseMutationEventV2,
  type DatabasePropertyEntity,
  type DatabaseViewEntity,
  type DataSourceMutationEventV3,
  type DataSourceEntity,
} from "../contracts-v2"
import { databaseClientQueryKey } from "./query-keys"

export type BootstrapScope = {
  databaseId: string
  includeDeleted?: boolean
  viewId?: string | null
}

type BootstrapCollectionKind =
  | "databases"
  | "data-sources"
  | "views"
  | "properties"

export type DatabaseBootstrapCollections = {
  database: QueryEntityCollection<DatabaseHostEntity>
  dataSources: QueryEntityCollection<DataSourceEntity>
  properties: QueryEntityCollection<DatabasePropertyEntity>
  readonly scope: BootstrapScope
  views: QueryEntityCollection<DatabaseViewEntity>
  apply(event: DatabaseMutationEventV2): void
  applySource(event: DataSourceMutationEventV3): void
  cleanup(): Promise<void>
  refetch(): Promise<void>
}

type QueryEntityCollection<TEntity extends object> = Collection<
  TEntity,
  string,
  QueryCollectionUtils<TEntity, string>
>

export function createDatabaseBootstrapCollections(options: {
  apiFetch: ApiFetcher
  queryClient: QueryClient
  scope: BootstrapScope
  sessionId: string
}): DatabaseBootstrapCollections {
  const queryOptions = databaseBootstrapQueryOptions(
    options.apiFetch,
    options.sessionId,
    options.scope,
  )
  const queryKey = queryOptions.queryKey
  const queryFn = queryOptions.queryFn
  const common = {
    queryClient: options.queryClient,
    queryFn,
    queryKey,
    staleTime: 30_000,
    startSync: true,
  }
  const database = createCollection(queryCollectionOptions({
    ...common,
    getKey: (entity: DatabaseHostEntity) => entity.id,
    id: bootstrapCollectionId(options.sessionId, options.scope, "databases"),
    schema: databaseHostEntitySchema,
    select: (response) => [response.database],
  }) as never) as unknown as QueryEntityCollection<DatabaseHostEntity>
  const dataSources = createCollection(queryCollectionOptions({
    ...common,
    getKey: (entity: DataSourceEntity) => entity.id,
    id: bootstrapCollectionId(options.sessionId, options.scope, "data-sources"),
    schema: dataSourceEntitySchema,
    select: (response) => response.dataSources,
  }) as never) as unknown as QueryEntityCollection<DataSourceEntity>
  const views = createCollection(queryCollectionOptions({
    ...common,
    getKey: (entity: DatabaseViewEntity) => entity.id,
    id: bootstrapCollectionId(options.sessionId, options.scope, "views"),
    schema: databaseViewEntitySchema,
    select: (response) => response.views,
  }) as never) as unknown as QueryEntityCollection<DatabaseViewEntity>
  const properties = createCollection(queryCollectionOptions({
    ...common,
    getKey: (entity: DatabasePropertyEntity) => entity.id,
    id: bootstrapCollectionId(options.sessionId, options.scope, "properties"),
    schema: databasePropertyEntitySchema,
    select: (response) => response.properties,
  }) as never) as unknown as QueryEntityCollection<DatabasePropertyEntity>

  return {
    database,
    dataSources,
    properties,
    scope: options.scope,
    views,
    apply(event) {
      const current = options.queryClient.getQueryData<DatabaseBootstrapResponse>(
        queryKey,
      )
      if (!current) return
      const next = applyBootstrapEvent(current, event)
      writeCollectionState(database, [next.database], [])
      writeCollectionState(
        dataSources,
        next.dataSources,
        event.changes.removedDataSourceIds ?? [],
      )
      writeCollectionState(
        properties,
        next.properties,
        event.changes.removedPropertyIds ?? [],
      )
      writeCollectionState(
        views,
        next.views,
        event.changes.removedViewIds ?? [],
      )
      options.queryClient.setQueryData<DatabaseBootstrapResponse>(
        queryKey,
        next,
      )
    },
    applySource(event) {
      const current = options.queryClient.getQueryData<DatabaseBootstrapResponse>(
        queryKey,
      )
      if (!current || !current.dataSources.some(({ id }) => id === event.sourceId)) {
        return
      }
      const next = applySourceEvent(current, event)
      writeCollectionState(dataSources, next.dataSources, [])
      writeCollectionState(
        properties,
        next.properties,
        event.changes.removedPropertyIds ?? [],
      )
      options.queryClient.setQueryData<DatabaseBootstrapResponse>(queryKey, next)
    },
    async cleanup() {
      await Promise.all([
        database.cleanup(),
        dataSources.cleanup(),
        properties.cleanup(),
        views.cleanup(),
      ])
    },
    async refetch() {
      await options.queryClient.refetchQueries({ exact: true, queryKey })
    },
  }
}

export function databaseBootstrapQueryOptions(
  apiFetch: ApiFetcher,
  sessionId: string,
  scope: BootstrapScope,
) {
  return {
    queryKey: databaseBootstrapQueryKey(sessionId, scope),
    queryFn: async () => databaseBootstrapResponseSchema.parse(
      await apiFetch<DatabaseBootstrapResponse>(bootstrapPath(scope)),
    ),
    staleTime: 30_000,
  }
}

function writeCollectionState<TEntity extends { id: string }>(
  collection: QueryEntityCollection<TEntity>,
  entities: TEntity[],
  removedIds: string[],
) {
  if (collection.status === "idle" || collection.status === "cleaned-up") return
  const entityIds = new Set(entities.map(({ id }) => id))
  const loadedRemovals = removedIds.filter((id) =>
    !entityIds.has(id) && collection._state.syncedData.has(id))
  collection.utils.writeBatch(() => {
    if (loadedRemovals.length > 0) {
      collection.utils.writeDelete(loadedRemovals)
    }
    if (entities.length > 0) collection.utils.writeUpsert(entities)
  })
}

function applyBootstrapEvent(
  current: DatabaseBootstrapResponse,
  event: DatabaseMutationEventV2,
): DatabaseBootstrapResponse {
  const changedHost = event.changes.databases?.find(
    (database) => database.id === current.database.id,
  )
  const database = changedHost ?? {
    ...current.database,
    version: event.version,
  }
  return {
    database,
    dataSources: applyEntityChanges(
      current.dataSources,
      event.changes.dataSources,
      event.changes.removedDataSourceIds,
    ),
    properties: applyEntityChanges(
      current.properties,
      event.changes.properties,
      event.changes.removedPropertyIds,
    ),
    views: applyEntityChanges(
      current.views,
      event.changes.views,
      event.changes.removedViewIds,
    ),
  }
}

function applySourceEvent(
  current: DatabaseBootstrapResponse,
  event: DataSourceMutationEventV3,
): DatabaseBootstrapResponse {
  const dataSources = current.dataSources.map((source) =>
    source.id === event.sourceId
      ? {
          ...source,
          ...(event.changes.source ?? {}),
          version: event.sourceVersion,
        }
      : source
  )
  return {
    ...current,
    dataSources,
    properties: applyEntityChanges(
      current.properties,
      event.changes.properties,
      event.changes.removedPropertyIds,
    ),
  }
}

function applyEntityChanges<TEntity extends { id: string }>(
  current: TEntity[],
  upserts: TEntity[] | undefined,
  removedIds: string[] | undefined,
) {
  if (!upserts?.length && !removedIds?.length) return current
  const next = new Map(current.map((entity) => [entity.id, entity]))
  for (const id of removedIds ?? []) next.delete(id)
  for (const entity of upserts ?? []) next.set(entity.id, entity)
  return [...next.values()]
}

export function databaseBootstrapQueryKey(
  sessionId: string,
  scope: BootstrapScope,
) {
  return databaseClientQueryKey(
    sessionId,
    "bootstrap",
    scope.databaseId,
    scope.viewId ?? null,
    scope.includeDeleted === true,
  )
}

export function bootstrapCollectionId(
  sessionId: string,
  scope: BootstrapScope,
  kind: BootstrapCollectionKind,
) {
  return [
    "database-client-v2",
    encodeURIComponent(sessionId),
    encodeURIComponent(scope.databaseId),
    encodeURIComponent(scope.viewId ?? "all-views"),
    scope.includeDeleted === true ? "deleted" : "active",
    kind,
  ].join(":")
}

export function readBootstrapCollectionStatus(
  collections: DatabaseBootstrapCollections,
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  const all = [
    collections.database,
    collections.dataSources,
    collections.properties,
    collections.views,
  ]
  const error = all
    .map((collection) => collection.utils.lastError)
    .find((candidate) => candidate !== undefined)
  const data = queryClient.getQueryData<DatabaseBootstrapResponse>(queryKey)
  const status = error
    ? "error"
    : data
      ? "success"
      : all.some((collection) =>
          collection.status === "loading" || collection.utils.isLoading)
        ? "loading"
        : "idle"

  return {
    data,
    error: error instanceof Error
      ? error
      : error === undefined
        ? null
        : new Error(String(error)),
    status,
  } as const
}

function bootstrapPath(scope: BootstrapScope) {
  const query = new URLSearchParams()
  if (scope.viewId) query.set("viewId", scope.viewId)
  if (scope.includeDeleted) query.set("includeDeleted", "1")
  const suffix = query.size > 0 ? `?${query.toString()}` : ""
  return `/databases/${encodeURIComponent(scope.databaseId)}/bootstrap${suffix}`
}
