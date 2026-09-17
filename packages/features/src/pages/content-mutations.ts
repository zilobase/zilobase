import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
  setPageDetailCache,
} from "../shared/item-action-cache";
import { patchDatabaseCachePage } from  "../databases/records/row-page-properties";
import type { DatabaseMutationEventV2 } from  "../databases/core/entities";
import { useDatabaseClient } from "../databases/client/provider";
import {
  defaultUserSettings,
  userSettingsQueryKey,
  type UserSettings,
} from "../user-settings/queries";
import { hasPageBodyContent } from "./content-state";
import {
  pageQueryKey,
  zilobaseAiPagesQueryKey,
  pagesNavRootQueryKey,
  pagesRootQueryKey,
  type PageDetail,
  type AccessLevel,
  type Page,
  type PageNavigationPayload,
  type PageMetadata,
} from "./queries";
import {
  applyNavDelta,
  type NavDelta,
} from "./nav-delta";
import { applyNavigationDeltaToCache } from "./navigation-realtime";

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
            isShared: pageRecord.isShared ?? current?.page.isShared,
          },
        }),
      );
      applyNavigationDeltaToCache(
        queryClient,
        pageRecord.workspaceId,
        navDelta ?? { upsertPages: [pageRecord] },
      );

      if (pageRecord.metadata?.zilobaseai) {
        await queryClient.invalidateQueries({
          queryKey: zilobaseAiPagesQueryKey(pageRecord.workspaceId),
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
      const page = resolveUpdatedPage(pagePatch, variables, current?.page);

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

export function useUpdatePagePropertyValue() {
  const databaseClient = useDatabaseClient();
  const { apiFetch } = useZilobaseFeatures();

  return useMutation({
    mutationFn: async ({
      propertyId,
      value,
      pageId,
    }: UpdatePagePropertyValueInput) =>
      apiFetch<{ events: DatabaseMutationEventV2[] }>(
        `/pages/${pageId}/properties/${propertyId}/value`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        },
      ),
    onSuccess: ({ events }) => {
      for (const event of events) {
        void databaseClient.ingest(event);
      }
    },
  });
}

function resolveUpdatedPage(
  pagePatch: UpdatePageResponse["page"],
  variables: UpdatePageInput,
  current: Page | undefined,
): Page | null {
  if ("content" in pagePatch) return pagePatch;
  if (!current) return null;
  return {
    ...current,
    ...pagePatch,
    ...(variables.content !== undefined ? {
      content: variables.content,
      hasContent: hasPageBodyContent(variables.content),
    } : {}),
  };
}
