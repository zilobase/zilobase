import type { QueryClient } from "@tanstack/react-query"

import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  databaseBootstrapResponseSchema,
} from "../contracts-v2"
import type { DatabasePayload } from "../queries"

export type DataSourceCommandScope = {
  dataSourceId: string
  hostDatabaseId: string
}

export async function resolveDataSourceCommandScope(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  databaseOrSourceId: string,
  explicitHostDatabaseId?: string,
): Promise<DataSourceCommandScope> {
  if (explicitHostDatabaseId) {
    return {
      dataSourceId: databaseOrSourceId,
      hostDatabaseId: explicitHostDatabaseId,
    }
  }

  const sourcePayload = findDataSourcePayload(queryClient, databaseOrSourceId)
  if (sourcePayload) {
    return {
      dataSourceId: databaseOrSourceId,
      hostDatabaseId: sourcePayload.database.id,
    }
  }

  for (const [, candidate] of queryClient.getQueriesData<DatabasePayload>({
    queryKey: ["database"],
  })) {
    if (candidate?.database.id !== databaseOrSourceId) continue
    if (!candidate.activeDataSource) break
    return {
      dataSourceId: candidate.activeDataSource.id,
      hostDatabaseId: candidate.database.id,
    }
  }

  const bootstrap = databaseBootstrapResponseSchema.parse(
    await apiFetch(
      `/databases/${encodeURIComponent(databaseOrSourceId)}/bootstrap`,
    ),
  )
  const source = bootstrap.dataSources[0]
  if (!source) {
    throw new Error(`Database ${databaseOrSourceId} has no data source`)
  }
  return {
    dataSourceId: source.id,
    hostDatabaseId: bootstrap.database.id,
  }
}

export function findDataSourcePayload(
  queryClient: QueryClient,
  dataSourceId: string,
) {
  for (const [, candidate] of queryClient.getQueriesData<DatabasePayload>({
    queryKey: ["database"],
  })) {
    if (candidate?.activeDataSource?.id === dataSourceId) return candidate
  }
  return null
}

export async function invalidateLegacyDataSourcePayloads(
  queryClient: QueryClient,
  dataSourceId: string,
) {
  const queryKeys = queryClient
    .getQueriesData<DatabasePayload>({ queryKey: ["database"] })
    .filter(([, candidate]) =>
      candidate?.dataSources.some(({ id }) => id === dataSourceId),
    )
    .map(([queryKey]) => queryKey)
  await Promise.all(
    queryKeys.map((queryKey) =>
      queryClient.invalidateQueries({ exact: true, queryKey }),
    ),
  )
}
