import type { QueryClient, QueryKey } from "@tanstack/react-query"

import type { DataSourceMutationEventV3 } from "../databases/contracts-v2"
import {
  pageRootQueryKey,
  type PagePropertiesPayload,
} from "./queries"

export function applyDataSourceMutationToPageProperties(
  queryClient: QueryClient,
  mutation: DataSourceMutationEventV3,
) {
  const entries = getPagePropertiesQueries(queryClient)

  for (const [queryKey, current] of entries) {
    if (!current?.sourceIds?.includes(mutation.sourceId)) continue

    const currentVersion = current.sourceVersions?.[mutation.sourceId]

    if (
      mutation.requiresReset ||
      mutation.areas.includes("properties") ||
      (mutation.changes.removedRecordIds?.length ?? 0) > 0
    ) {
      if (
        currentVersion === undefined || mutation.sourceVersion > currentVersion
      ) {
        void queryClient.invalidateQueries({ exact: true, queryKey })
      }
      continue
    }

    if (
      currentVersion === undefined ||
      mutation.sourceVersion !== currentVersion + 1
    ) {
      if (
        currentVersion === undefined || mutation.sourceVersion > currentVersion
      ) {
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

export function recoverPagePropertiesIfSourceBehind(
  queryClient: QueryClient,
  sourceId: string,
  serverVersion: number,
) {
  for (const [queryKey, current] of getPagePropertiesQueries(queryClient)) {
    if (!current?.sourceIds?.includes(sourceId)) continue

    if ((current.sourceVersions?.[sourceId] ?? -1) < serverVersion) {
      void queryClient.invalidateQueries({ exact: true, queryKey })
    }
  }
}

export function preferNewestPagePropertiesPayload(
  current: PagePropertiesPayload | undefined,
  incoming: PagePropertiesPayload,
) {
  if (!current) return incoming

  for (const [sourceId, incomingVersion] of Object.entries(
    incoming.sourceVersions ?? {},
  )) {
    const currentVersion = current.sourceVersions?.[sourceId]

    if (currentVersion !== undefined && currentVersion > incomingVersion) {
      return current
    }
  }

  return incoming
}

function applyMutationToPageProperties(
  current: PagePropertiesPayload,
  pageId: string,
  mutation: DataSourceMutationEventV3,
): PagePropertiesPayload {
  const record = mutation.changes.records?.find((item) => item.pageId === pageId)

  return {
    ...current,
    sourceVersions: {
      ...current.sourceVersions,
      [mutation.sourceId]: mutation.sourceVersion,
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
