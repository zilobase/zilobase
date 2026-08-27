import type { QueryClient, QueryKey } from "@tanstack/react-query"

import { databasePayloadRootQueryKey, type DatabasePayload } from "./queries"

export type DatabasePayloadCacheSnapshot = Array<
  [QueryKey, DatabasePayload | null | undefined]
>

export function getDataSourcePayloadQueryEntries(
  queryClient: QueryClient,
  dataSourceId: string,
) {
  return queryClient
    .getQueriesData<DatabasePayload | null>({ queryKey: ["database"] })
    .filter(([, payload]) => payload?.activeDataSource?.id === dataSourceId)
}

export async function cancelDataSourcePayloadQueries(
  queryClient: QueryClient,
  dataSourceId: string,
) {
  const entries = getDataSourcePayloadQueryEntries(queryClient, dataSourceId)
  await Promise.all(
    entries.map(([queryKey]) =>
      queryClient.cancelQueries({ exact: true, queryKey }),
    ),
  )
  return entries
}

export function updateDataSourcePayloadQueryData(
  queryClient: QueryClient,
  dataSourceId: string,
  update: (payload: DatabasePayload) => DatabasePayload,
): DatabasePayloadCacheSnapshot {
  const entries = getDataSourcePayloadQueryEntries(queryClient, dataSourceId)

  for (const [queryKey, current] of entries) {
    if (current) queryClient.setQueryData(queryKey, update(current))
  }

  return entries
}

export function restoreDatabasePayloadSnapshots(
  queryClient: QueryClient,
  snapshots: DatabasePayloadCacheSnapshot,
) {
  for (const [queryKey, payload] of snapshots) {
    queryClient.setQueryData(queryKey, payload)
  }
}

export function setDataSourcePayloadQueryData(
  queryClient: QueryClient,
  dataSourceId: string,
  payload: DatabasePayload,
) {
  const entries = getDataSourcePayloadQueryEntries(queryClient, dataSourceId)

  for (const [queryKey] of entries) {
    queryClient.setQueryData(
      queryKey,
      queryKey[2] === "schema"
        ? {
            ...payload,
            rowCount: undefined,
            rows: [],
            rowsPagination: undefined,
            values: [],
          }
        : payload,
    )
  }
}

export function setDatabasePayloadQueryData(
  queryClient: QueryClient,
  databaseId: string,
  payload: DatabasePayload,
) {
  const entries = queryClient.getQueriesData<DatabasePayload | null>({
    queryKey: databasePayloadRootQueryKey(databaseId),
  })

  for (const [queryKey] of entries) {
    queryClient.setQueryData(
      queryKey,
      queryKey[2] === "schema"
        ? {
            ...payload,
            rowCount: undefined,
            rows: [],
            rowsPagination: undefined,
            values: [],
          }
        : payload,
    )
  }
}
