import { useMemo } from "react";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";

import { useNotelabFeatures } from "../context";
import { useDatabase } from "../databases/hooks";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
  setPageDetailCache,
} from "../item-action-cache";
import {
  buildPagePropertiesPayloadFromDatabase,
  findDatabaseIdForRowPage,
  patchDatabaseCachePage,
  patchDatabaseCachePagePropertyValues,
} from "../databases/row-page-properties";
import { useDatabaseIdForRowPage } from "../databases/use-database-id-for-row-page";
import {
  defaultUserSettings,
  userSettingsQueryKey,
  type UserSettings,
} from "../user-settings/queries";
import type { NavItemKind } from "./item-relationships";
import {
  pageQueryKey,
  pageQueryOptions,
  getPageFromDetail,
  pageAccessQueryKey,
  pageAccessQueryOptions,
  pageAccessTargetsQueryOptions,
  pageCommentsQueryKey,
  pageCommentsQueryOptions,
  pagePersonAccessTargetsQueryOptions,
  pagePropertiesQueryKey,
  pagePropertiesQueryOptions,
  pageThreadsQueryKey,
  pageThreadsQueryOptions,
  notelabAiPagesQueryKey,
  notelabAiPagesQueryOptions,
  pagesNavRootQueryKey,
  pagesQueryKey,
  pagesQueryOptions,
  pagesRootQueryKey,
  type PageDetail,
  type AccessLevel,
  type AccessTargetType,
  type PagesDeletedFilter,
  type Page,
  type PageNavigationPayload,
  type PageCommentsPayload,
  type PageCommentMessage,
  type PageMetadata,
  type PagePropertiesPayload,
} from "./queries";
import {
  applyPageFavoriteToNav,
  applyItemVisitToNav,
  applyNavDelta,
  type NavDelta,
} from "./nav-delta";

type CreatePageInput = {
  content?: unknown;
  metadata?: PageMetadata;
  workspaceId: string;
  name?: string;
  emoji?: string;
  parentItemId?: string;
};

type CreatePageResponse = {
  navDelta?: NavDelta;
  page: Page;
};

type CreatedPageResult = Page & {
  navDelta?: NavDelta;
};

type UpdatePageInput = {
  id: string;
  content?: unknown;
  name?: string;
  metadata?: PageMetadata;
};

type UpdatePageResponse =
  | {
      page: Page;
    }
  | {
      page: Pick<Page, "id" | "updatedAt">;
    };

type UpdatePagePropertyValueInput = {
  propertyId: string;
  value: unknown;
  pageId: string;
};

type CreatePageCommentInput = {
  body: string;
  pageId: string;
};

type UpdatePageCommentInput = {
  body: string;
  messageId: string;
  pageId: string;
};

type DeletePageCommentInput = {
  messageId: string;
  pageId: string;
};

type UpdatePageCommentReactionInput = {
  emoji: string;
  messageId: string;
  pageId: string;
};

type ResolvePageCommentThreadInput = {
  pageId: string;
  threadId?: string;
};

type UpsertPageAccessInput = {
  accessLevel: AccessLevel;
  targetId: string;
  targetType: AccessTargetType;
  pageId: string;
};

type SetPagePublishedInput = {
  isPublished: boolean;
  pageId: string;
};

type SetPageFavoriteInput = {
  isFavorite: boolean;
  pageId: string;
};

type RecordItemVisitInput = {
  itemId: string;
  itemKind: "database" | "page";
  workspaceId: string;
};

export function usePages(
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter; enabled?: boolean },
) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery({
    ...pagesQueryOptions(apiFetch, workspaceId, {
      deleted: options?.deleted,
    }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    select: (navigation) => navigation.pages,
  });
}

export function usePageNavigation(
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter; enabled?: boolean },
) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery({
    ...pagesQueryOptions(apiFetch, workspaceId, {
      deleted: options?.deleted,
    }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  });
}

export function useNotelabAiPages(workspaceId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery(notelabAiPagesQueryOptions(apiFetch, workspaceId));
}

type PageQueryHookOptions = {
  refetchOnMount?: boolean;
};

export function usePage(
  pageId: string | null | undefined,
  options?: PageQueryHookOptions,
) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount,
    select: (detail) => getPageFromDetail(detail),
  });
}

export function usePageAccessLevel(
  pageId: string | null | undefined,
  options?: PageQueryHookOptions,
) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount,
    select: (detail) => detail?.accessLevel ?? null,
  });
}

export function usePageAccess(pageId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery(pageAccessQueryOptions(apiFetch, pageId));
}

export function usePageAccessTargets(workspaceId: string | null | undefined) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery(pageAccessTargetsQueryOptions(apiFetch, workspaceId));
}

export function usePagePersonAccessTargets(
  pageId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery({
    ...pagePersonAccessTargetsQueryOptions(apiFetch, pageId),
    enabled: Boolean(pageId) && (options?.enabled ?? true),
  });
}

type PagePropertiesOptions = {
  databaseId?: string | null;
};

export function usePageProperties(
  pageId: string | null | undefined,
  options?: PagePropertiesOptions,
) {
  const { apiFetch } = useNotelabFeatures();
  const resolvedDatabaseId = useDatabaseIdForRowPage(
    pageId,
    options?.databaseId,
  );
  const databaseQuery = useDatabase(resolvedDatabaseId);
  const apiQuery = useQuery({
    ...pagePropertiesQueryOptions(apiFetch, pageId),
    enabled: Boolean(pageId) && !resolvedDatabaseId,
  });
  const derivedPayload = useMemo(() => {
    if (!resolvedDatabaseId || !databaseQuery.data || !pageId) {
      return undefined;
    }

    return buildPagePropertiesPayloadFromDatabase(databaseQuery.data, pageId);
  }, [databaseQuery.data, resolvedDatabaseId, pageId]);

  if (!resolvedDatabaseId) {
    return apiQuery;
  }

  return {
    ...databaseQuery,
    data: derivedPayload ?? undefined,
    isLoading: databaseQuery.isLoading,
    isFetching: databaseQuery.isFetching,
    isError: databaseQuery.isError,
    error: databaseQuery.error,
    refetch: databaseQuery.refetch,
  };
}

export function usePageComments(
  pageId: string | null | undefined,
  threadIdOrEnabled?: string | null | boolean,
  enabled = true,
) {
  const { apiFetch } = useNotelabFeatures();

  let threadId: string | null | undefined;
  let isEnabled = enabled;

  if (typeof threadIdOrEnabled === "boolean") {
    isEnabled = threadIdOrEnabled;
    threadId = undefined;
  } else if (threadIdOrEnabled !== undefined) {
    threadId = threadIdOrEnabled;
  }

  return useQuery(
    pageCommentsQueryOptions(apiFetch, pageId, threadId, isEnabled),
  );
}

export function usePageThreads(
  pageId: string | null | undefined,
  enabled = true,
) {
  const { apiFetch } = useNotelabFeatures();

  return useQuery(pageThreadsQueryOptions(apiFetch, pageId, enabled));
}

function updateCommentReaction(
  payload: PageCommentsPayload,
  messageId: string,
  emoji: string,
  delta: 1 | -1,
) {
  return {
    ...payload,
    comments: payload.comments.map((comment) => {
      if (comment.id !== messageId) {
        return comment;
      }

      const reactions = [...(comment.reactions ?? [])];
      const index = reactions.findIndex((reaction) => reaction.emoji === emoji);
      const current =
        index >= 0 ? reactions[index] : { count: 0, emoji, reactedByMe: false };
      const nextCount = Math.max(0, current.count + delta);
      const nextReaction = {
        ...current,
        count: nextCount,
        reactedByMe: delta > 0,
      };

      if (nextCount === 0) {
        if (index >= 0) {
          reactions.splice(index, 1);
        }
      } else if (index >= 0) {
        reactions[index] = nextReaction;
      } else {
        reactions.push(nextReaction);
      }

      return { ...comment, reactions };
    }),
  };
}

type CommentCacheSnapshot = Array<
  readonly [readonly unknown[], PageCommentsPayload | undefined]
>;

function pageCommentsQueryPrefix(pageId: string) {
  return ["page", pageId, "comments"] as const;
}

function getCommentCacheSnapshot(queryClient: QueryClient, pageId: string) {
  return queryClient.getQueriesData<PageCommentsPayload>({
    queryKey: pageCommentsQueryPrefix(pageId),
  }) as CommentCacheSnapshot;
}

function restoreCommentCacheSnapshot(
  queryClient: QueryClient,
  snapshot: CommentCacheSnapshot,
) {
  for (const [queryKey, payload] of snapshot) {
    queryClient.setQueryData(queryKey, payload);
  }
}

function updateCachedCommentPayloads(
  queryClient: QueryClient,
  pageId: string,
  update: (payload: PageCommentsPayload) => PageCommentsPayload,
) {
  queryClient.setQueriesData<PageCommentsPayload>(
    { queryKey: pageCommentsQueryPrefix(pageId) },
    (payload) => (payload ? update(payload) : payload),
  );
}

function syncCommentPayload(
  queryClient: QueryClient,
  pageId: string,
  payload: PageCommentsPayload,
  options?: { setActive?: boolean },
) {
  const threadId = payload.thread?.id;

  if (!threadId) {
    return;
  }

  queryClient.setQueryData(pageCommentsQueryKey(pageId, threadId), payload);
  updateCachedCommentPayloads(queryClient, pageId, (current) =>
    current.thread?.id === threadId ? payload : current,
  );

  const activePayload = queryClient.getQueryData<PageCommentsPayload>(
    pageCommentsQueryKey(pageId),
  );

  if (options?.setActive || activePayload?.thread?.id === threadId) {
    queryClient.setQueryData(pageCommentsQueryKey(pageId), payload);
  }
}

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

export function useCreatePage() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      content = null,
      workspaceId,
      name = "",
      emoji,
      metadata: inputMetadata,
      parentItemId,
    }: CreatePageInput) => {
      const userSettings =
        queryClient.getQueryData<UserSettings>(userSettingsQueryKey) ??
        defaultUserSettings;
      const metadata: PageMetadata = {
        embeddedItemsOpenAs: userSettings.embeddedItemsOpenAs,
        fullWidth: Boolean(userSettings.pageFullWidth),
        useUserEmbeddedItemsPreference: true,
        useUserFullWidthPreference: true,
        ...(inputMetadata ?? {}),
      };

      if (emoji) {
        metadata.emoji = emoji;
      }

      const result = await apiFetch<CreatePageResponse>("/pages", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          name,
          type: "pageblock",
          url: "#",
          content,
          metadata,
          parentItemId,
        }),
      });

      return {
        ...result.page,
        navDelta: result.navDelta,
      } satisfies CreatedPageResult;
    },
    onSuccess: async (page) => {
      const { navDelta, ...pageRecord } = page;
      const parentItemId = navDelta?.upsertPlacements?.find(
        (placement) =>
          placement.itemKind === "page" &&
          placement.itemId === pageRecord.id &&
          placement.placementKind === "primary",
      )?.parentId;
      const parentDetail = parentItemId
        ? queryClient.getQueryData<PageDetail | null>(
            pageQueryKey(parentItemId),
          )
        : null;
      const inheritedAccessLevel =
        parentDetail?.accessLevel ?? ("full" as AccessLevel);

      queryClient.setQueryData<PageDetail | null>(
        pageQueryKey(pageRecord.id),
        (current) => ({
          accessLevel: current?.accessLevel ?? inheritedAccessLevel,
          page: {
            ...(current?.page ?? {}),
            ...pageRecord,
            isFavorite: pageRecord.isFavorite ?? current?.page.isFavorite,
            isTeamspace: pageRecord.isTeamspace ?? current?.page.isTeamspace,
          },
        }),
      );
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(pageRecord.workspaceId) },
        (current) =>
          applyNavDelta(current, navDelta ?? { upsertPages: [pageRecord] }),
      );

      if (pageRecord.metadata?.notelabai) {
        await queryClient.invalidateQueries({
          queryKey: notelabAiPagesQueryKey(pageRecord.workspaceId),
        });
      }
    },
  });
}

export function useUpsertPageAccess() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      accessLevel,
      targetId,
      targetType,
      pageId,
    }: UpsertPageAccessInput) => {
      const result = await apiFetch<{ access: unknown }>(
        `/pages/${pageId}/access`,
        {
          method: "PUT",
          body: JSON.stringify({ accessLevel, targetId, targetType }),
        },
      );

      return result.access;
    },
    onSuccess: async (_access, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: pageAccessQueryKey(variables.pageId),
        }),
        queryClient.invalidateQueries({
          queryKey: pageQueryKey(variables.pageId),
        }),
      ]);
    },
  });
}

export function useDeletePageAccess() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      ruleId,
      pageId,
    }: {
      ruleId: string;
      pageId: string;
    }) =>
      apiFetch<{ access: unknown }>(`/pages/${pageId}/access/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_access, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: pageAccessQueryKey(variables.pageId),
        }),
        queryClient.invalidateQueries({
          queryKey: pageQueryKey(variables.pageId),
        }),
      ]);
    },
  });
}

export function useSetPagePublished() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ isPublished, pageId }: SetPagePublishedInput) => {
      if (isPublished) {
        const result = await apiFetch<{ access: unknown }>(
          `/pages/${pageId}/access`,
          {
            method: "PUT",
            body: JSON.stringify({
              accessLevel: "view",
              targetId: "*",
              targetType: "public",
            }),
          },
        );

        return result.access;
      }

      return apiFetch<{ access: unknown }>(`/pages/${pageId}/access/public`, {
        method: "DELETE",
      });
    },
    onSuccess: async (_access, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: pageAccessQueryKey(variables.pageId),
        }),
        queryClient.invalidateQueries({
          queryKey: pageQueryKey(variables.pageId),
        }),
      ]);
    },
  });
}

type EmbedPageItemInput = {
  hostPageId: string;
  itemId: string;
  kind: NavItemKind;
};

export function useEmbedPageItem() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ hostPageId, itemId, kind }: EmbedPageItemInput) =>
      apiFetch<{ action: string; host: Page }>(
        `/pages/${hostPageId}/embed-item`,
        {
          method: "POST",
          body: JSON.stringify({ itemId, kind }),
        },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: pagesQueryKey(result.host.workspaceId),
      });
    },
  });
}

export function useRemovePageEmbed() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ hostPageId, itemId, kind }: EmbedPageItemInput) =>
      apiFetch<{ action: string }>(`/pages/${hostPageId}/embed-item`, {
        method: "DELETE",
        body: JSON.stringify({ itemId, kind }),
      }),
    onSuccess: async (_result, variables) => {
      const host = getPageFromDetail(
        queryClient.getQueryData(pageQueryKey(variables.hostPageId)),
      );

      if (host) {
        await queryClient.invalidateQueries({
          queryKey: pagesQueryKey(host.workspaceId),
        });
      }
    },
  });
}

export function useUpdatePage() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdatePageInput) => {
      const isContentOnlyPatch =
        patch.content !== undefined &&
        patch.name === undefined &&
        patch.metadata === undefined;
      const current = queryClient.getQueryData<PageDetail | null>(
        pageQueryKey(id),
      );
      const result = await apiFetch<UpdatePageResponse>(
        isContentOnlyPatch ? `/pages/${id}/content` : `/pages/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            isContentOnlyPatch
              ? {
                  baseUpdatedAt: current?.page.updatedAt,
                  content: patch.content,
                }
              : patch,
          ),
        },
      );

      return result.page;
    },
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: pageQueryKey(variables.id) }),
        queryClient.cancelQueries({ queryKey: pagesRootQueryKey() }),
      ]);
      const previous = queryClient.getQueryData<PageDetail | null>(
        pageQueryKey(variables.id),
      );
      const currentPage = previous?.page;
      const previousNavQueries =
        queryClient.getQueriesData<PageNavigationPayload>({
          queryKey: pagesRootQueryKey(),
        });

      if (!currentPage) {
        return { previous, previousNavQueries };
      }

      const optimisticPage: Page = {
        ...currentPage,
        ...(variables.content !== undefined
          ? { content: variables.content }
          : {}),
        ...(variables.metadata !== undefined
          ? { metadata: variables.metadata }
          : {}),
        ...(variables.name !== undefined ? { name: variables.name } : {}),
        ...(variables.name !== undefined || variables.metadata !== undefined
          ? { updatedAt: new Date().toISOString() }
          : {}),
      };

      queryClient.setQueryData<PageDetail | null>(
        pageQueryKey(variables.id),
        (): PageDetail => ({
          accessLevel: previous.accessLevel ?? null,
          page: optimisticPage,
        }),
      );
      patchDatabaseCachePage(queryClient, optimisticPage);
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(optimisticPage.workspaceId) },
        (current) => applyNavDelta(current, { upsertPages: [optimisticPage] }),
      );

      return { previous, previousNavQueries };
    },
    onError: (_error, variables, context) => {
      if (!context?.previous) {
        return;
      }

      queryClient.setQueryData(pageQueryKey(variables.id), context.previous);
      patchDatabaseCachePage(queryClient, context.previous.page);

      for (const [queryKey, data] of context.previousNavQueries) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: async (pagePatch, variables) => {
      const current = queryClient.getQueryData<PageDetail | null>(
        pageQueryKey(pagePatch.id),
      );
      const page =
        "content" in pagePatch
          ? pagePatch
          : current?.page
            ? {
                ...current.page,
                ...pagePatch,
                ...(variables.content !== undefined
                  ? { content: variables.content }
                  : {}),
              }
            : null;

      if (!page) {
        await queryClient.invalidateQueries({
          queryKey: pageQueryKey(pagePatch.id),
        });
        return;
      }

      queryClient.setQueryData<PageDetail | null>(
        pageQueryKey(page.id),
        (current) => ({
          accessLevel: current?.accessLevel ?? "full",
          page,
        }),
      );
      const rowPageDatabaseIds = patchDatabaseCachePage(queryClient, page);

      const navFieldsChanged =
        variables.name !== undefined || variables.metadata !== undefined;

      if (!navFieldsChanged) {
        return;
      }

      if (rowPageDatabaseIds.length > 0) {
        return;
      }

      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesNavRootQueryKey(page.workspaceId) },
        (current) => applyNavDelta(current, { upsertPages: [page] }),
      );

      if (variables.metadata?.notelabai !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: notelabAiPagesQueryKey(page.workspaceId),
        });
      }
    },
  });
}

type DeletePageResult = {
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
  page: Page | null;
};

type RestorePageResult = {
  page: Page;
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};

export function useDeletePage() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async (pageId: string) =>
      apiFetch<DeletePageResult>(`/pages/${pageId}`, {
        method: "DELETE",
      }),
    onSuccess: async (result) =>
      invalidateDeletedItems({
        includeNotelabAi: true,
        workspaceId: result.page?.workspaceId,
        queryClient,
        result,
      }),
  });
}

export function useRestorePage() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async (pageId: string) =>
      apiFetch<RestorePageResult>(`/pages/${pageId}/restore`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      await invalidateRestoredItems({
        includeNotelabAi: true,
        workspaceId: result.page.workspaceId,
        queryClient,
        result,
      });
      setPageDetailCache(queryClient, result.page);
    },
  });
}

export function useSetPageFavorite() {
  const { apiFetch, queryClient } = useNotelabFeatures();

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
  const { apiFetch, queryClient } = useNotelabFeatures();

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
      queryClient.setQueriesData<PageNavigationPayload | undefined>(
        { queryKey: pagesQueryKey(variables.workspaceId) },
        (current) => applyItemVisitToNav(current, result),
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

export function useUpdatePagePropertyValue() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      propertyId,
      value,
      pageId,
    }: UpdatePagePropertyValueInput) =>
      apiFetch<PagePropertiesPayload>(
        `/pages/${pageId}/properties/${propertyId}/value`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        },
      ),
    onSuccess: (payload, variables) => {
      queryClient.setQueryData(
        pagePropertiesQueryKey(variables.pageId),
        payload,
      );

      const databaseId =
        findDatabaseIdForRowPage(queryClient, variables.pageId) ?? null;

      if (databaseId) {
        patchDatabaseCachePagePropertyValues(
          queryClient,
          databaseId,
          variables.pageId,
          payload,
        );
      }
    },
  });
}

export function useCreatePageComment() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ body, pageId }: CreatePageCommentInput) =>
      apiFetch<PageCommentsPayload>(`/pages/${pageId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: pageCommentsQueryPrefix(variables.pageId),
      });
      const previous = getCommentCacheSnapshot(queryClient, variables.pageId);
      const activePayload = queryClient.getQueryData<PageCommentsPayload>(
        pageCommentsQueryKey(variables.pageId),
      );
      const existingThread =
        activePayload?.thread ??
        previous
          .map(([, payload]) => payload?.thread)
          .find((thread) => thread && !thread.resolvedAt) ??
        null;
      const now = new Date().toISOString();
      const thread = existingThread ?? {
        createdAt: now,
        id: `optimistic-thread:${crypto.randomUUID()}`,
        lastActivityAt: now,
        workspaceId: "",
        updatedAt: now,
        pageId: variables.pageId,
      };
      const optimisticComment: PageCommentMessage = {
        author: null,
        authorId: null,
        body: variables.body,
        createdAt: now,
        id: `optimistic-comment:${crypto.randomUUID()}`,
        reactions: [],
        threadId: thread.id,
        updatedAt: now,
      };

      if (existingThread) {
        updateCachedCommentPayloads(queryClient, variables.pageId, (payload) =>
          payload.thread?.id === existingThread.id
            ? { ...payload, comments: [...payload.comments, optimisticComment] }
            : payload,
        );
      } else {
        queryClient.setQueryData<PageCommentsPayload>(
          pageCommentsQueryKey(variables.pageId),
          { comments: [optimisticComment], thread },
        );
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      restoreCommentCacheSnapshot(queryClient, context?.previous ?? []);
    },
    onSuccess: (payload, variables) => {
      syncCommentPayload(queryClient, variables.pageId, payload, {
        setActive: true,
      });
      queryClient.invalidateQueries({
        queryKey: pageThreadsQueryKey(variables.pageId),
      });
    },
  });
}

export function useUpdatePageComment() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ body, messageId, pageId }: UpdatePageCommentInput) =>
      apiFetch<PageCommentsPayload>(`/pages/${pageId}/comments/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: pageCommentsQueryPrefix(variables.pageId),
      });
      const previous = getCommentCacheSnapshot(queryClient, variables.pageId);

      updateCachedCommentPayloads(queryClient, variables.pageId, (payload) => ({
        ...payload,
        comments: payload.comments.map((comment) =>
          comment.id === variables.messageId
            ? {
                ...comment,
                body: variables.body,
                editedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : comment,
        ),
      }));

      return { previous };
    },
    onError: (_error, _variables, context) => {
      restoreCommentCacheSnapshot(queryClient, context?.previous ?? []);
    },
    onSuccess: (payload, variables) => {
      syncCommentPayload(queryClient, variables.pageId, payload);
      queryClient.invalidateQueries({
        queryKey: pageThreadsQueryKey(variables.pageId),
      });
    },
  });
}

export function useDeletePageComment() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ messageId, pageId }: DeletePageCommentInput) =>
      apiFetch<PageCommentsPayload>(`/pages/${pageId}/comments/${messageId}`, {
        method: "DELETE",
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: pageCommentsQueryPrefix(variables.pageId),
      });
      const previous = getCommentCacheSnapshot(queryClient, variables.pageId);

      updateCachedCommentPayloads(queryClient, variables.pageId, (payload) => ({
        ...payload,
        comments: payload.comments.filter(
          (comment) => comment.id !== variables.messageId,
        ),
      }));

      return { previous };
    },
    onError: (_error, _variables, context) => {
      restoreCommentCacheSnapshot(queryClient, context?.previous ?? []);
    },
    onSuccess: (payload, variables) => {
      syncCommentPayload(queryClient, variables.pageId, payload);
      queryClient.invalidateQueries({
        queryKey: pageThreadsQueryKey(variables.pageId),
      });
    },
  });
}

export function useAddPageCommentReaction() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      emoji,
      messageId,
      pageId,
    }: UpdatePageCommentReactionInput) =>
      apiFetch<PageCommentsPayload>(
        `/pages/${pageId}/comments/${messageId}/reactions`,
        {
          method: "POST",
          body: JSON.stringify({ emoji }),
        },
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: pageCommentsQueryPrefix(variables.pageId),
      });
      const previous = getCommentCacheSnapshot(queryClient, variables.pageId);

      updateCachedCommentPayloads(queryClient, variables.pageId, (payload) =>
        updateCommentReaction(payload, variables.messageId, variables.emoji, 1),
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      restoreCommentCacheSnapshot(queryClient, context?.previous ?? []);
    },
    onSuccess: (payload, variables) => {
      syncCommentPayload(queryClient, variables.pageId, payload);
      queryClient.invalidateQueries({
        queryKey: pageThreadsQueryKey(variables.pageId),
      });
    },
  });
}

export function useRemovePageCommentReaction() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({
      emoji,
      messageId,
      pageId,
    }: UpdatePageCommentReactionInput) =>
      apiFetch<PageCommentsPayload>(
        `/pages/${pageId}/comments/${messageId}/reactions`,
        {
          method: "DELETE",
          body: JSON.stringify({ emoji }),
        },
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: pageCommentsQueryPrefix(variables.pageId),
      });
      const previous = getCommentCacheSnapshot(queryClient, variables.pageId);

      updateCachedCommentPayloads(queryClient, variables.pageId, (payload) =>
        updateCommentReaction(
          payload,
          variables.messageId,
          variables.emoji,
          -1,
        ),
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      restoreCommentCacheSnapshot(queryClient, context?.previous ?? []);
    },
    onSuccess: (payload, variables) => {
      syncCommentPayload(queryClient, variables.pageId, payload);
      queryClient.invalidateQueries({
        queryKey: pageThreadsQueryKey(variables.pageId),
      });
    },
  });
}

export function useResolvePageCommentThread() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ pageId, threadId }: ResolvePageCommentThreadInput) =>
      apiFetch<PageCommentsPayload>(
        `/pages/${pageId}/comments/thread/resolve`,
        {
          method: "PATCH",
          body: JSON.stringify(threadId ? { threadId } : {}),
        },
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pageCommentsQueryKey(variables.pageId),
      });
      queryClient.invalidateQueries({
        queryKey: pageThreadsQueryKey(variables.pageId),
      });
    },
  });
}

export function useUnresolvePageCommentThread() {
  const { apiFetch, queryClient } = useNotelabFeatures();

  return useMutation({
    mutationFn: async ({ pageId, threadId }: ResolvePageCommentThreadInput) =>
      apiFetch<PageCommentsPayload>(
        `/pages/${pageId}/comments/thread/unresolve`,
        {
          method: "PATCH",
          body: JSON.stringify(threadId ? { threadId } : {}),
        },
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pageCommentsQueryKey(variables.pageId),
      });
      queryClient.invalidateQueries({
        queryKey: pageThreadsQueryKey(variables.pageId),
      });
    },
  });
}
