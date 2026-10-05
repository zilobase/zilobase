import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { setPageDetailCache } from "../shared/item-action-cache";
import { pageQueryKey, pagesQueryKey, pagesRootQueryKey } from "./queries";
import {
  updatePageContexts,
  type PageDetailReference,
  type PageNavigationReference,
} from "./cache";
import type { Page } from "./contracts";

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
  navigation: PageNavigationReference | undefined,
  pageId: string,
  isFavorite: boolean,
) {
  return navigation
    ? {
        ...navigation,
        pages: navigation.pages.map((page) =>
          page.id === pageId ? { ...page, context: { ...page.context, isFavorite } } : page,
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
      const result = await apiFetch<{ page: Page }>(`/pages/${pageId}/favorite`, {
        method: isFavorite ? "PUT" : "DELETE",
      });

      return result.page;
    },
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: pageQueryKey(variables.pageId),
        }),
        queryClient.cancelQueries({ queryKey: pagesRootQueryKey() }),
      ]);

      const previousDetail = queryClient.getQueryData<PageDetailReference | null>(
        pageQueryKey(variables.pageId),
      );
      const previousNavQueries = queryClient
        .getQueriesData<PageNavigationReference>({
          queryKey: pagesRootQueryKey(),
        })
        .filter(([queryKey]) => isPageNavQueryKey(queryKey));

      queryClient.setQueryData<PageDetailReference | null>(
        pageQueryKey(variables.pageId),
        (current) =>
          current
            ? {
                ...current,
                page: {
                  ...current.page,
                  context: { ...current.page.context, isFavorite: variables.isFavorite },
                },
              }
            : current,
      );
      for (const [queryKey] of previousNavQueries) {
        queryClient.setQueryData<PageNavigationReference | undefined>(queryKey, (current) =>
          applyPageFavoriteToList(current, variables.pageId, variables.isFavorite),
        );
      }

      return { previousDetail, previousNavQueries };
    },
    onError: (_error, variables, context) => {
      queryClient.setQueryData(pageQueryKey(variables.pageId), context?.previousDetail);

      for (const [queryKey, data] of context?.previousNavQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: async (page) => {
      setPageDetailCache(queryClient, page);
      updatePageContexts(queryClient, page.id, { isFavorite: page.isFavorite });
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
        return queryClient.invalidateQueries({
          queryKey: ["workspaces", variables.workspaceId, "ai-agent-profiles"],
        });
      }
      queryClient.setQueriesData<PageNavigationReference>(
        { queryKey: pagesQueryKey(variables.workspaceId) },
        (current) => {
          if (!current) return current;
          return result.itemKind === "page"
            ? {
                ...current,
                pages: current.pages.map((page) =>
                  page.id === result.itemId
                    ? { ...page, context: { ...page.context, lastVisitedAt: result.lastVisitedAt } }
                    : page,
                ),
              }
            : {
                ...current,
                databases: current.databases.map((database) =>
                  database.id === result.itemId
                    ? { ...database, lastVisitedAt: result.lastVisitedAt }
                    : database,
                ),
              };
        },
      );

      if (result.itemKind === "page") {
        queryClient.setQueryData<PageDetailReference | null>(
          pageQueryKey(result.itemId),
          (current) =>
            current
              ? {
                  ...current,
                  page: {
                    ...current.page,
                    context: { ...current.page.context, lastVisitedAt: result.lastVisitedAt },
                  },
                }
              : current,
        );
      }
    },
  });
}
