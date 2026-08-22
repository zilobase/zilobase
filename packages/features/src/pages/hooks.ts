import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useZilobaseFeatures } from "../context";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
  setPageDetailCache,
} from "../item-action-cache";
import {
  buildPagePropertiesPayloadFromDatabase,
  patchDatabaseCachePage,
} from "../databases/row-page-properties";
import { useDatabase } from "../databases/hooks";
import { useDatabaseIdForRowPage } from "../databases/use-database-id-for-row-page";
import { applyDatabaseRealtimeMutation } from "../databases/realtime";
import type { DatabaseMutationResponse } from "../databases/mutation-types";
import {
  defaultUserSettings,
  userSettingsQueryKey,
  type UserSettings,
} from "../user-settings/queries";
import type { NavItemKind } from "./item-relationships";
import { hasPageBodyContent } from "./content-state";
import {
  pageQueryKey,
  pageQueryOptions,
  getPageFromDetail,
  pageAccessQueryKey,
  pageAccessQueryOptions,
  pageAccessTargetsQueryOptions,
  pagePersonAccessTargetsQueryOptions,
  pagePersonAccessTargetsQueryKey,
  pageGuestInvitationQueryKey,
  pageGuestInvitationQueryOptions,
  pageGuestInvitationsQueryKey,
  pageGuestInvitationsQueryOptions,
  pageGuestRequestsQueryKey,
  pageGuestRequestsQueryOptions,
  pagePropertiesQueryOptions,
  zilobaseAiPagesQueryKey,
  zilobaseAiPagesQueryOptions,
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
  type PageMetadata,
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
  teamspaceId?: string | null;
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
  const { apiFetch } = useZilobaseFeatures();

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
  const { apiFetch } = useZilobaseFeatures();

  return useQuery({
    ...pagesQueryOptions(apiFetch, workspaceId, {
      deleted: options?.deleted,
    }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  });
}

export function useZilobaseAiPages(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery(zilobaseAiPagesQueryOptions(apiFetch, workspaceId));
}

type PageQueryHookOptions = {
  refetchOnMount?: boolean;
};

export function usePage(
  pageId: string | null | undefined,
  options?: PageQueryHookOptions,
) {
  const { apiFetch } = useZilobaseFeatures();

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
  const { apiFetch } = useZilobaseFeatures();

  return useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount,
    select: (detail) => detail?.accessLevel ?? null,
  });
}

export function usePageDatabaseIds(
  pageId: string | null | undefined,
  options?: PageQueryHookOptions,
) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount,
    select: (detail) => detail?.databaseIds ?? [],
  });
}

export function usePageAccess(pageId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery(pageAccessQueryOptions(apiFetch, pageId));
}

export function usePageAccessTargets(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery(pageAccessTargetsQueryOptions(apiFetch, workspaceId));
}

export function usePagePersonAccessTargets(
  pageId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery({
    ...pagePersonAccessTargetsQueryOptions(apiFetch, pageId),
    enabled: Boolean(pageId) && (options?.enabled ?? true),
  });
}

export function usePageGuestInvitations(pageId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageGuestInvitationsQueryOptions(apiFetch, pageId));
}

export function usePageGuestRequests(pageId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageGuestRequestsQueryOptions(apiFetch, pageId));
}

export function usePageGuestInvitation(
  invitationId: string | null | undefined,
) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageGuestInvitationQueryOptions(apiFetch, invitationId));
}

export function useInvitePageGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: {
      accessLevel: AccessLevel;
      email: string;
      pageId: string;
    }) =>
      apiFetch<{ invitation?: unknown; request?: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guest-invitations`,
        {
          body: JSON.stringify({
            accessLevel: input.accessLevel,
            email: input.email,
          }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: pageGuestInvitationsQueryKey(input.pageId),
        }),
        queryClient.invalidateQueries({
          queryKey: pageGuestRequestsQueryKey(input.pageId),
        }),
      ]);
    },
  });
}

export function useCancelPageGuestInvitation() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: { invitationId: string; pageId: string }) =>
      apiFetch<{ invitation: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guest-invitations/${encodeURIComponent(input.invitationId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: pageGuestInvitationsQueryKey(input.pageId),
      });
    },
  });
}

export function useAcceptPageGuestInvitation() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<{ pageId: string }>(
        `/page-guest-invitations/${encodeURIComponent(invitationId)}/accept`,
        { method: "POST" },
      ),
    onSuccess: async (result, invitationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pageQueryKey(result.pageId) }),
        queryClient.invalidateQueries({
          queryKey: pageGuestInvitationQueryKey(invitationId),
        }),
      ]);
    },
  });
}

export function useRevokePageGuest() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: { pageId: string; userId: string }) =>
      apiFetch<{ access: unknown }>(
        `/pages/${encodeURIComponent(input.pageId)}/guests/${encodeURIComponent(input.userId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pageAccessQueryKey(input.pageId) }),
        queryClient.invalidateQueries({
          queryKey: pagePersonAccessTargetsQueryKey(input.pageId),
        }),
        queryClient.invalidateQueries({ queryKey: pageQueryKey(input.pageId) }),
      ]);
    },
  });
}

type PagePropertiesOptions = {
  databaseId?: string | null;
};

export function usePageProperties(
  pageId: string | null | undefined,
  options?: PagePropertiesOptions,
) {
  const { apiFetch } = useZilobaseFeatures();
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
    if (!resolvedDatabaseId || !databaseQuery.data) return undefined;

    return buildPagePropertiesPayloadFromDatabase(databaseQuery.data, pageId) ??
      undefined;
  }, [databaseQuery.data, pageId, resolvedDatabaseId]);

  return resolvedDatabaseId
    ? { ...databaseQuery, data: derivedPayload }
    : apiQuery;
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
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      content = null,
      workspaceId,
      name = "",
      emoji,
      metadata: inputMetadata,
      parentItemId,
      teamspaceId,
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
          teamspaceId,
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
          databaseIds: current?.databaseIds ?? [],
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

      if (pageRecord.metadata?.zilobaseai) {
        await queryClient.invalidateQueries({
          queryKey: zilobaseAiPagesQueryKey(pageRecord.workspaceId),
        });
      }
    },
  });
}

export function useMovePageToTeamspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: (input: {
      pageId: string;
      teamspaceId: string | null;
      workspaceId: string;
    }) =>
      apiFetch<{ movedPageIds: string[]; teamspaceId: string | null }>(
        `/pages/${encodeURIComponent(input.pageId)}/move-teamspace`,
        {
          body: JSON.stringify({ teamspaceId: input.teamspaceId }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: pagesQueryKey(input.workspaceId),
      });
    },
  });
}

export function useUpsertPageAccess() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

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
  const { apiFetch, queryClient } = useZilobaseFeatures();

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
  const { apiFetch, queryClient } = useZilobaseFeatures();

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
  const { apiFetch, queryClient } = useZilobaseFeatures();

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
  const { apiFetch, queryClient } = useZilobaseFeatures();

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
  const { apiFetch, queryClient } = useZilobaseFeatures();

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
          ? {
              content: variables.content,
              hasContent: hasPageBodyContent(variables.content),
            }
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
          databaseIds: previous.databaseIds ?? [],
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
                  ? {
                      content: variables.content,
                      hasContent: hasPageBodyContent(variables.content),
                    }
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
          databaseIds: current?.databaseIds ?? [],
          page,
        }),
      );
      const rowPageDatabaseIds = patchDatabaseCachePage(queryClient, page);

      const navFieldsChanged =
        variables.content !== undefined ||
        variables.name !== undefined ||
        variables.metadata !== undefined;

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

      if (variables.metadata?.zilobaseai !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: zilobaseAiPagesQueryKey(page.workspaceId),
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
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (pageId: string) =>
      apiFetch<DeletePageResult>(`/pages/${pageId}`, {
        method: "DELETE",
      }),
    onSuccess: async (result) =>
      invalidateDeletedItems({
        includeZilobaseAi: true,
        workspaceId: result.page?.workspaceId,
        queryClient,
        result,
      }),
  });
}

export function useRestorePage() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async (pageId: string) =>
      apiFetch<RestorePageResult>(`/pages/${pageId}/restore`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      await invalidateRestoredItems({
        includeZilobaseAi: true,
        workspaceId: result.page.workspaceId,
        queryClient,
        result,
      });
      setPageDetailCache(queryClient, result.page);
    },
  });
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
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      propertyId,
      value,
      pageId,
    }: UpdatePagePropertyValueInput) =>
      apiFetch<{ mutations: DatabaseMutationResponse[] }>(
        `/pages/${pageId}/properties/${propertyId}/value`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        },
      ),
    onSuccess: ({ mutations }) => {
      for (const mutation of mutations) {
        applyDatabaseRealtimeMutation(queryClient, {
          ...mutation,
          actorId: "http",
          protocolVersion: 1,
          type: "database.mutation",
        });
      }
    },
  });
}
