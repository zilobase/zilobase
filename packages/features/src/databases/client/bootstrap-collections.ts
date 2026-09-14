import type { QueryClient } from "@tanstack/react-query"
import { createCollection, type Collection } from "@tanstack/db"
import { queryCollectionOptions } from "@tanstack/query-db-collection"

import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  databaseBootstrapResponseSchema,
  databaseHostEntitySchema,
  databasePropertyEntitySchema,
  databaseViewEntitySchema,
  dataSourceEntitySchema,
  type DatabaseBootstrapResponse,
  type DatabaseHostEntity,
  type DatabasePropertyEntity,
  type DatabaseViewEntity,
  type DataSourceEntity,
} from "../contracts-v2"
import { databaseClientQueryKey } from "./query-keys"

type BootstrapScope = {
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
  database: Collection<DatabaseHostEntity, string>
  dataSources: Collection<DataSourceEntity, string>
  properties: Collection<DatabasePropertyEntity, string>
  views: Collection<DatabaseViewEntity, string>
  cleanup(): Promise<void>
}

export function createDatabaseBootstrapCollections(options: {
  apiFetch: ApiFetcher
  queryClient: QueryClient
  scope: BootstrapScope
  sessionId: string
}): DatabaseBootstrapCollections {
  const queryKey = databaseBootstrapQueryKey(options.sessionId, options.scope)
  const queryFn = async () => databaseBootstrapResponseSchema.parse(
    await options.apiFetch<DatabaseBootstrapResponse>(bootstrapPath(options.scope)),
  )
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
  }))
  const dataSources = createCollection(queryCollectionOptions({
    ...common,
    getKey: (entity: DataSourceEntity) => entity.id,
    id: bootstrapCollectionId(options.sessionId, options.scope, "data-sources"),
    schema: dataSourceEntitySchema,
    select: (response) => response.dataSources,
  }))
  const views = createCollection(queryCollectionOptions({
    ...common,
    getKey: (entity: DatabaseViewEntity) => entity.id,
    id: bootstrapCollectionId(options.sessionId, options.scope, "views"),
    schema: databaseViewEntitySchema,
    select: (response) => response.views,
  }))
  const properties = createCollection(queryCollectionOptions({
    ...common,
    getKey: (entity: DatabasePropertyEntity) => entity.id,
    id: bootstrapCollectionId(options.sessionId, options.scope, "properties"),
    schema: databasePropertyEntitySchema,
    select: (response) => response.properties,
  }))

  return {
    database,
    dataSources,
    properties,
    views,
    async cleanup() {
      await Promise.all([
        database.cleanup(),
        dataSources.cleanup(),
        properties.cleanup(),
        views.cleanup(),
      ])
    },
  }
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
