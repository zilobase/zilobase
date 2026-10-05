import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
  setPageDetailCache,
} from "../shared/item-action-cache";
import { hasPageBodyContent } from "./content-state";
import { pageQueryKey, zilobaseAiPagesQueryKey } from "./queries";
import type { PageDetail, AccessLevel, Page } from "./contracts";
import type { PageMetadata } from "./item-relationships";
import { refreshTitleMembership } from "../databases/queries/page-membership";
import { sharedClient } from "../data/client";
import { cachePageDetail, readCachedPage, type PageDetailReference } from "./cache";
import { type NavDelta } from "./nav-delta";
import { applyNavigationDeltaToCache } from "./navigation-cache";

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
      const metadata: PageMetadata = { ...(inputMetadata ?? {}) };

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
        ? queryClient.getQueryData<PageDetail | null>(pageQueryKey(parentItemId))
        : null;
      const inheritedAccessLevel = parentDetail?.accessLevel ?? ("full" as AccessLevel);

      cachePageDetail(queryClient, {
        accessLevel: inheritedAccessLevel,
        databaseIds: [],
        page: pageRecord,
      });
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
      const client = sharedClient(queryClient);
      const read = client.capture();
      const current = readCachedPage(queryClient, id);
      const reference = queryClient.getQueryData<PageDetailReference | null>(pageQueryKey(id));
      const entities = reference
        ? client.get(reference.page.cacheId)
        : current
          ? client.resolve(read, current.workspaceId)
          : undefined;
      const confirm = async () => {
        const contentOnly =
          patch.content !== undefined && patch.name === undefined && patch.metadata === undefined;
        const result = await apiFetch<UpdatePageResponse>(
          contentOnly ? `/pages/${id}/content` : `/pages/${id}`,
          {
            method: "PATCH",
            body: JSON.stringify(
              contentOnly ? { baseUpdatedAt: current?.updatedAt, content: patch.content } : patch,
            ),
          },
        );
        const page = resolveUpdatedPage(result.page, { id, ...patch }, current ?? undefined);
        if (!page) throw new Error("Page acknowledgement needs an authorized page read");
        cachePageDetail(
          queryClient,
          {
            ...reference,
            page,
            accessLevel: reference?.accessLevel ?? null,
            databaseIds: reference?.databaseIds ?? [],
          },
          read,
        );
        return page;
      };
      if (!entities || (patch.name === undefined && patch.metadata === undefined)) return confirm();
      return entities.session.commands.run(
        entities.pages,
        id,
        (draft) => {
          if (patch.name !== undefined) draft.name = patch.name;
          if (patch.metadata !== undefined)
            draft.metadata = { ...draft.metadata, ...patch.metadata };
        },
        confirm,
      );
    },
    onSuccess: (page, variables) => {
      if (variables.name !== undefined) refreshTitleMembership(queryClient, [page.id]);
      if (variables.metadata?.zilobaseai !== undefined)
        void queryClient
          .invalidateQueries({ queryKey: zilobaseAiPagesQueryKey(page.workspaceId) })
          .catch(() => undefined);
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
    ...(variables.content !== undefined
      ? {
          content: variables.content,
          hasContent: hasPageBodyContent(variables.content),
        }
      : {}),
  };
}
