import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { setPageDetailCache } from "../shared/item-action-cache";
import {
  pageQueryKey,
  pagesNavRootQueryKey,
  pagesQueryKey,
  pagesRootQueryKey,
} from "./queries";
import type { PageDetail, Page, PageNavigationPayload } from "./contracts";
import {
  applyPageFavoriteToNav,
  applyItemVisitToNav,
} from "./nav-delta";

type SetPageFavoriteInput = {
  isFavorite: boolean;
  pageId: string;
};

type RecordItemVisitInput = {
  itemId: string;
  itemKind: "agent" | "database" | "page";
  workspaceId: string;
};

function applyPageFavoriteToList(
  navigation: PageNavigationPayload | undefined,
  pageId: string,
  isFavorite: boolean,
) {
  return navigation
    ? {
        ...navigation,
        pages: navigation.pages.map((page) =>
          page.id === pageId ? { ...page, isFavorite } : page,
        ),
      }
    : navigation;
}

function isPageNavQueryKey(queryKey: readonly unknown[]) {
  return queryKey[0] === "pages" && queryKey[2] === "nav";
}

export function useSetPageFavorite() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({ isFavorite, pageId }: SetPageFavoriteInput) => {
      const result = await apiFetch<{ page: Page }>(
        `/pages/${pageId}/favorite`,
        { method: isFavorite ? "PUT" : "DELETE" },
      );

      return result.page;
    },
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: pageQueryKey(variables.pageId),
        }),
        queryClient.cancelQueries({ queryKey: pagesRootQueryKey() }),
      ]);

      const previousDetail = queryClient.getQueryData<PageDetail | null>(
        pageQueryKey(variables.pageId),
      );
      const previousNavQueries = queryClient
        .getQueriesData<PageNavigationPayload>({
          queryKey: pagesRootQueryKey(),
        })
        .filter(([queryKey]) => isPageNavQueryKey(queryKey));

      queryClient.setQueryData<PageDetail | null>(
        pageQueryKey(variables.pageId),
        (current) =>
          current
            ? {
                ...current,
                page: {
                  ...current.page,
                  isFavorite: variables.isFavorite,
                },
              }
            : current,
      );
      for (const [queryKey] of previousNavQueries) {
        queryClient.setQueryData<PageNavigationPayload | undefined>(
          queryKey,
          (current) =>
            applyPageFavoriteToList(
              current,
              variables.pageId,
              variables.isFavorite,
            ),
        );
      }

      return { previousDetail, previousNavQueries };
    },
    onError: (_error, variables, context) => {
      queryClient.setQueryData(
        pageQueryKey(variables.pageId),
        context?.previousDetail,
      );

      for (const [queryKey, data] of context?.previousNavQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: async (page) => {
      setPageDetailCache(queryClient, page);
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(page.workspaceId) },
        (current) => applyPageFavoriteToNav(current, page),
      );
    },
  });
}

export function useRecordItemVisit() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (input: RecordItemVisitInput) =>
      apiFetch<{
        itemId: string;
        itemKind: RecordItemVisitInput["itemKind"];
        lastVisitedAt: string;
      }>("/pages/item-visits", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (result, variables) => {
      if (result.itemKind === "agent") {
        void queryClient.invalidateQueries({
          queryKey: ["workspaces", variables.workspaceId, "ai-agent-profiles"],
        });
        return;
      }
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesQueryKey(variables.workspaceId) },
        (current) => applyItemVisitToNav(current, {
          itemId: result.itemId,
          itemKind: result.itemKind as "database" | "page",
          lastVisitedAt: result.lastVisitedAt,
        }),
      );

      if (result.itemKind === "page") {
        queryClient.setQueryData<PageDetail | null>(
          pageQueryKey(result.itemId),
          (current) =>
            current
              ? {
                  ...current,
                  page: {
                    ...current.page,
                    lastVisitedAt: result.lastVisitedAt,
                  },
                }
              : current,
        );
      }
    },
  });
}
