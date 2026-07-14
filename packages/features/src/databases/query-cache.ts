import type { QueryClient } from "@tanstack/react-query"

import { databasePayloadRootQueryKey, type DatabasePayload } from "./queries"

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
