import type { QueryClient } from "@tanstack/react-query"

import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  databaseBootstrapResponseSchema,
  databaseRecordWindowResponseSchema,
  type DatabaseBootstrapResponse,
  type DatabaseRecordEntity,
} from  "../core/entities"

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

  const sourceBootstrap = findDataSourceBootstrap(queryClient, databaseOrSourceId)
  if (sourceBootstrap) {
    return {
      dataSourceId: databaseOrSourceId,
      hostDatabaseId: sourceBootstrap.database.id,
    }
  }

  for (const candidate of cachedBootstraps(queryClient)) {
    if (candidate.database.id !== databaseOrSourceId) continue
    const source = candidate.dataSources[0]
    if (!source) break
    return {
      dataSourceId: source.id,
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

export function findDataSourceBootstrap(
  queryClient: QueryClient,
  dataSourceId: string,
) {
  return cachedBootstraps(queryClient).find((candidate) =>
    candidate.dataSources.some(({ id }) => id === dataSourceId),
  ) ?? null
}

export function findLoadedDataSourceRecords(
  queryClient: QueryClient,
  dataSourceId: string,
): DatabaseRecordEntity[] {
  for (const [, candidate] of queryClient.getQueriesData({
    queryKey: ["database-client-v2"],
  })) {
    const direct = databaseRecordWindowResponseSchema.safeParse(candidate)
    if (direct.success && direct.data.records.some(
      (record) => record.dataSourceId === dataSourceId,
    )) return direct.data.records
    if (!candidate || typeof candidate !== "object" || !("pages" in candidate)) {
      continue
    }
    const pages = (candidate as { pages?: unknown }).pages
    if (!Array.isArray(pages)) continue
    const latest = databaseRecordWindowResponseSchema.safeParse(pages.at(-1))
    if (latest.success && latest.data.records.some(
      (record) => record.dataSourceId === dataSourceId,
    )) return latest.data.records
  }
  return []
}

export async function invalidateDataSourceCollections(
  queryClient: QueryClient,
  databaseOrSourceId: string,
) {
  const queryKeys = queryClient
    .getQueriesData({ queryKey: ["database-client-v2"] })
    .filter(([, candidate]) => {
      const parsed = databaseBootstrapResponseSchema.safeParse(candidate)
      return parsed.success && (
        parsed.data.database.id === databaseOrSourceId ||
        parsed.data.dataSources.some(({ id }) => id === databaseOrSourceId)
      )
    })
    .map(([queryKey]) => queryKey)
  await Promise.all(
    queryKeys.map((queryKey) =>
      queryClient.invalidateQueries({ exact: true, queryKey }),
    ),
  )
}

function cachedBootstraps(queryClient: QueryClient): DatabaseBootstrapResponse[] {
  return queryClient
    .getQueriesData({ queryKey: ["database-client-v2"] })
    .flatMap(([, candidate]) => {
      const parsed = databaseBootstrapResponseSchema.safeParse(candidate)
      return parsed.success ? [parsed.data] : []
    })
}
