import type { QueryClient } from "@tanstack/react-query"

import type { Page } from  "../../pages/queries"
import { databaseRecordWindowResponseSchema } from  "../core/entities"
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

  for (const [queryKey, data] of queryClient.getQueriesData({
    queryKey: ["database-client-v2"],
  })) {
    if (queryKey[2] !== "records") continue
    const databaseId = queryKey[3]

    if (typeof databaseId === "string" && recordWindows(data).some(
      (window) => window.records.some((row) => row.pageId === pageId),
    )) {
      databaseIds.push(databaseId)
    }
  }

  return [...new Set(databaseIds)]
}

export function patchDatabaseCachePage(
  queryClient: QueryClient,
  page: Page,
) {
  const databaseIds = findDatabaseIdsForRowPage(queryClient, page.id)

  if (databaseIds.length > 0) {
    void queryClient.invalidateQueries({ queryKey: ["database-client-v2"] })
  }

  return databaseIds
}

function recordWindows(value: unknown) {
  const direct = databaseRecordWindowResponseSchema.safeParse(value)
  if (direct.success) return [direct.data]
  if (!value || typeof value !== "object" || !("pages" in value)) return []
  const pages = (value as { pages?: unknown }).pages
  if (!Array.isArray(pages)) return []
  return pages.flatMap((page) => {
    const parsed = databaseRecordWindowResponseSchema.safeParse(page)
    return parsed.success ? [parsed.data] : []
  })
}
