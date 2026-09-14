import type { QueryClient, QueryKey } from "@tanstack/react-query"

import type { DatabaseMutationEventV2 } from "../databases/contracts-v2"
import {
  pageRootQueryKey,
  type PagePropertiesPayload,
} from "./queries"

export function applyDatabaseMutationToPageProperties(
  queryClient: QueryClient,
  mutation: DatabaseMutationEventV2,
) {
  const entries = getPagePropertiesQueries(queryClient)

  for (const [queryKey, current] of entries) {
    if (!current?.databaseIds?.includes(mutation.databaseId)) continue

    const currentVersion = current.databaseVersions?.[mutation.databaseId]

    if (
      mutation.requiresReset ||
      mutation.areas.includes("properties") ||
      (mutation.changes.removedRecordIds?.length ?? 0) > 0
    ) {
      if (currentVersion === undefined || mutation.version > currentVersion) {
        void queryClient.invalidateQueries({ exact: true, queryKey })
      }
      continue
    }

    if (currentVersion === undefined || mutation.version !== currentVersion + 1) {
      if (currentVersion === undefined || mutation.version > currentVersion) {
        void queryClient.invalidateQueries({ exact: true, queryKey })
      }
      continue
    }

    const pageId = typeof queryKey[1] === "string" ? queryKey[1] : null

    if (!pageId) continue

    queryClient.setQueryData(
      queryKey,
      applyMutationToPageProperties(current, pageId, mutation),
    )
  }
}

export function recoverPagePropertiesIfBehind(
  queryClient: QueryClient,
  databaseId: string,
  serverVersion: number,
) {
  for (const [queryKey, current] of getPagePropertiesQueries(queryClient)) {
    if (!current?.databaseIds?.includes(databaseId)) continue

    if ((current.databaseVersions?.[databaseId] ?? -1) < serverVersion) {
      void queryClient.invalidateQueries({ exact: true, queryKey })
    }
  }
}

export function preferNewestPagePropertiesPayload(
  current: PagePropertiesPayload | undefined,
  incoming: PagePropertiesPayload,
) {
  if (!current) return incoming

  for (const [databaseId, incomingVersion] of Object.entries(
    incoming.databaseVersions ?? {},
  )) {
    const currentVersion = current.databaseVersions?.[databaseId]

    if (currentVersion !== undefined && currentVersion > incomingVersion) {
      return current
    }
  }

  return incoming
}

function applyMutationToPageProperties(
  current: PagePropertiesPayload,
  pageId: string,
  mutation: DatabaseMutationEventV2,
): PagePropertiesPayload {
  const record = mutation.changes.records?.find((item) => item.pageId === pageId)

  return {
    ...current,
    databaseVersions: {
      ...current.databaseVersions,
      [mutation.databaseId]: mutation.version,
    },
    ...(record ? { values: Object.values(record.valuesByPropertyId) } : {}),
  }
}

function getPagePropertiesQueries(queryClient: QueryClient) {
  return queryClient
    .getQueriesData<PagePropertiesPayload>({ queryKey: pageRootQueryKey() })
    .filter(([queryKey]) => isPagePropertiesQuery(queryKey))
}

function isPagePropertiesQuery(queryKey: QueryKey) {
  return queryKey[0] === "page" && queryKey[2] === "properties"
}
