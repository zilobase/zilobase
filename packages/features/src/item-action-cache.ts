import type { QueryClient } from "@tanstack/react-query"

import type { ApiFetcher } from "./context"
import { databaseQueryKey } from "./databases/queries"
import { applyPageFavoriteToNav } from "./pages/nav-delta"
import {
  notelabAiPagesQueryKey,
  pagesNavRootQueryKey,
  pageQueryKey,
  pagesRootQueryKey,
  pagesQueryKey,
  type Page,
  type PageDetail,
} from "./pages/queries"

export type DeletedItemIds = {
  deletedDatabaseIds: string[]
  deletedPageIds: string[]
}

export function isPageFavoriteInCache(
  queryClient: QueryClient,
  pageId: string,
  workspaceId?: string | null,
) {
  return Boolean(getPageFromCache(queryClient, pageId, workspaceId)?.isFavorite)
}

export async function favoritePages({
  apiFetch,
  pageIds,
  queryClient,
}: {
  apiFetch: ApiFetcher
  workspaceId: string
  pageIds: string[]
  queryClient: QueryClient
}) {
  const uniquePageIds = [...new Set(pageIds)].filter(Boolean)

  if (uniquePageIds.length === 0) {
    return
  }

  const results = await Promise.all(
    uniquePageIds.map((pageId) =>
      apiFetch<{ page: Page }>(`/pages/${pageId}/favorite`, {
        method: "PUT",
      }),
    ),
  )

  for (const { page } of results) {
    setPageDetailCache(queryClient, page)
    queryClient.setQueriesData<Page[] | undefined>(
      { queryKey: pagesNavRootQueryKey(page.workspaceId) },
      (current) => applyPageFavoriteToNav(current, page),
    )
  }
}

export async function invalidateDeletedItems({
  includeNotelabAi = false,
  workspaceId,
  queryClient,
  result,
}: {
  includeNotelabAi?: boolean
  workspaceId: string | null | undefined
  queryClient: QueryClient
  result: DeletedItemIds
}) {
  if (!workspaceId) {
    return
  }

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: pagesNavRootQueryKey(workspaceId),
    }),
    includeNotelabAi
      ? queryClient.invalidateQueries({
          queryKey: notelabAiPagesQueryKey(workspaceId),
        })
      : Promise.resolve(),
  ])

  for (const databaseId of result.deletedDatabaseIds) {
    queryClient.removeQueries({ queryKey: databaseQueryKey(databaseId) })
  }

  for (const pageId of result.deletedPageIds) {
    queryClient.removeQueries({ queryKey: pageQueryKey(pageId) })
  }
}

export function setPageDetailCache(
  queryClient: QueryClient,
  page: Page,
) {
  queryClient.setQueryData<PageDetail | null>(
    pageQueryKey(page.id),
    (current) => ({
      accessLevel: current?.accessLevel ?? null,
      page,
    }),
  )
}

function getPageFromCache(
  queryClient: QueryClient,
  pageId: string,
  workspaceId?: string | null,
) {
  const detail = queryClient.getQueryData<PageDetail | null>(
    pageQueryKey(pageId),
  )

  if (detail?.page.id === pageId) {
    return detail.page
  }

  const workspacePages = workspaceId
    ? queryClient.getQueryData<Page[]>(pagesQueryKey(workspaceId))
    : null
  const page = workspacePages?.find(
    (candidate) => candidate.id === pageId,
  )

  if (page) {
    return page
  }

  for (const [, pages] of queryClient.getQueriesData<Page[]>({
    queryKey: pagesRootQueryKey(),
  })) {
    const page = pages?.find(
      (candidate) => candidate.id === pageId,
    )

    if (page) {
      return page
    }
  }

  return null
}
