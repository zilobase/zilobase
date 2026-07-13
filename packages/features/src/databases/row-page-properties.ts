import type { QueryClient } from "@tanstack/react-query"

import type {
  Page,
  PagePropertiesPayload,
} from "../pages/queries"

import {
  databasePayloadRootQueryKey,
  databaseQueryKey,
  databaseRootQueryKey,
  type DatabasePayload,
  type DatabaseProperty,
} from "./queries"
export function findDatabaseIdForRowPage(
  queryClient: QueryClient,
  pageId: string,
) {
  return findDatabaseIdsForRowPage(queryClient, pageId)[0] ?? null
}

export function findDatabaseIdsForRowPage(
  queryClient: QueryClient,
  pageId: string,
) {
  const databaseIds: string[] = []

  for (const [queryKey, data] of queryClient.getQueriesData<DatabasePayload>({
    queryKey: databaseRootQueryKey(),
  })) {
    const databaseId = queryKey[1]

    if (typeof databaseId !== "string" || !data) {
      continue
    }

    if (data.rows.some((row) => row.pageId === pageId)) {
      databaseIds.push(databaseId)
    }
  }

  return databaseIds
}

export function isDatabaseRowPage(
  payload: DatabasePayload,
  pageId: string,
) {
  return payload.rows.some((row) => row.pageId === pageId)
}

export function buildPagePropertiesPayloadFromDatabase(
  payload: DatabasePayload,
  pageId?: string | null,
): PagePropertiesPayload | null {
  if (pageId && !isDatabaseRowPage(payload, pageId)) {
    return null
  }

  const properties = [...payload.properties]
    .sort(
      (left: DatabaseProperty, right: DatabaseProperty) =>
        left.position - right.position,
    )
    .map(({ property }) => property)

  const values = pageId
    ? payload.values.filter((value) => value.pageId === pageId)
    : []

  return { properties, values }
}

export function patchDatabaseCachePagePropertyValues(
  queryClient: QueryClient,
  databaseId: string,
  pageId: string,
  pageProperties: PagePropertiesPayload,
) {
  queryClient.setQueryData<DatabasePayload>(
    databaseQueryKey(databaseId),
    (current) => {
      if (!current || !isDatabaseRowPage(current, pageId)) {
        return current
      }

      const remainingValues = current.values.filter(
        (value) => value.pageId !== pageId,
      )
      const nextValues = pageProperties.values.filter(
        (value) => value.pageId === pageId,
      )

      return {
        ...current,
        values: [...remainingValues, ...nextValues],
      }
    },
  )
}

export function patchDatabaseCachePage(
  queryClient: QueryClient,
  page: Page,
) {
  const databaseIds = findDatabaseIdsForRowPage(queryClient, page.id)

  for (const databaseId of databaseIds) {
    queryClient.setQueriesData<DatabasePayload>(
      { queryKey: databasePayloadRootQueryKey(databaseId) },
      (current) => patchDatabasePayloadPage(current, page),
    )
  }

  return databaseIds
}

function patchDatabasePayloadPage(
  current: DatabasePayload | undefined,
  page: Page,
) {
  if (!current || !isDatabaseRowPage(current, page.id)) {
    return current
  }

  const rows = current.rows.map((row) => {
    if (row.pageId !== page.id) {
      return row
    }

    return {
      ...row,
      page: {
        ...row.page,
        deletedAt: page.deletedAt,
        id: page.id,
        metadata: page.metadata,
        name: page.name,
        updatedAt: page.updatedAt,
      },
    }
  })

  return { ...current, rows }
}
