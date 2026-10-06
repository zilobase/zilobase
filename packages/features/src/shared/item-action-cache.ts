import { sharedClient, type SharedClient } from "../data/client";
import type { QueryClient } from "@tanstack/react-query";

import type { ApiFetcher } from "./api-fetcher";
import { databaseAccessQueryKey } from "../databases/queries/queries";
import {
  cachePageDetail,
  readCachedPage,
  updatePageContexts,
  type PageDetailReference,
} from "../pages/cache";
import { zilobaseAiPagesQueryKey, pagesNavRootQueryKey, pageQueryKey } from "../pages/queries";
import type { Page } from "../pages/contracts";

export type DeletedItemIds = {
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};

export type RestoredItemIds = {
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};

export function isPageFavoriteInCache(
  queryClient: QueryClient,
  pageId: string,
  workspaceId?: string | null,
) {
  return Boolean(getPageFromCache(queryClient, pageId, workspaceId)?.isFavorite);
}

export async function favoritePages({
  apiFetch,
  pageIds,
  queryClient,
}: {
  apiFetch: ApiFetcher;
  workspaceId: string;
  pageIds: string[];
  queryClient: QueryClient;
}) {
  const uniquePageIds = [...new Set(pageIds)].filter(Boolean);

  if (uniquePageIds.length === 0) {
    return;
  }

  const read = await sharedClient(queryClient).captureRead();
  const results = await Promise.all(
    uniquePageIds.map((pageId) =>
      apiFetch<{ page: Page }>(`/pages/${pageId}/favorite`, {
        method: "PUT",
      }),
    ),
  );

  for (const { page } of results) {
    setPageDetailCache(queryClient, page, read);
    updatePageContexts(queryClient, page.id, { isFavorite: page.isFavorite }, read);
  }
}

export async function invalidateDeletedItems({
  includeZilobaseAi = false,
  workspaceId,
  queryClient,
  result,
}: {
  includeZilobaseAi?: boolean;
  workspaceId: string | null | undefined;
  queryClient: QueryClient;
  result: DeletedItemIds;
}) {
  if (!workspaceId) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: pagesNavRootQueryKey(workspaceId),
    }),
    includeZilobaseAi
      ? queryClient.invalidateQueries({
          queryKey: zilobaseAiPagesQueryKey(workspaceId),
        })
      : Promise.resolve(),
  ]);

  for (const databaseId of result.deletedDatabaseIds) {
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "db" &&
        query.queryKey.includes(databaseId) &&
        query.queryKey[query.queryKey.length - 1] === true,
    });
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[0] === "db" &&
        query.queryKey.includes(databaseId) &&
        query.queryKey[query.queryKey.length - 1] !== true,
    });
    queryClient.removeQueries({
      queryKey: databaseAccessQueryKey(databaseId),
    });
  }

  for (const pageId of result.deletedPageIds) {
    queryClient.removeQueries({ queryKey: pageQueryKey(pageId) });
  }
}

export async function invalidateRestoredItems({
  includeZilobaseAi = false,
  workspaceId,
  queryClient,
  result,
}: {
  includeZilobaseAi?: boolean;
  workspaceId: string;
  queryClient: QueryClient;
  result: RestoredItemIds;
}) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: pagesNavRootQueryKey(workspaceId),
    }),
    includeZilobaseAi
      ? queryClient.invalidateQueries({
          queryKey: zilobaseAiPagesQueryKey(workspaceId),
        })
      : Promise.resolve(),
    ...result.restoredDatabaseIds.map((databaseId) =>
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === "db" && query.queryKey.includes(databaseId),
      }),
    ),
    ...result.restoredDatabaseIds.map((databaseId) =>
      queryClient.invalidateQueries({
        queryKey: databaseAccessQueryKey(databaseId),
      }),
    ),
    ...result.restoredPageIds.map((pageId) =>
      queryClient.invalidateQueries({ queryKey: pageQueryKey(pageId) }),
    ),
  ]);
}

export function setPageDetailCache(
  queryClient: QueryClient,
  page: Page,
  read: ReturnType<SharedClient["capture"]> = sharedClient(queryClient).capture(),
) {
  const current = queryClient.getQueryData<PageDetailReference | null>(pageQueryKey(page.id));
  cachePageDetail(
    queryClient,
    {
      ...current,
      page,
      accessLevel: current?.accessLevel ?? null,
      databaseIds: current?.databaseIds ?? [],
    },
    read,
  );
}

function getPageFromCache(queryClient: QueryClient, pageId: string, _workspaceId?: string | null) {
  return readCachedPage(queryClient, pageId);
}
