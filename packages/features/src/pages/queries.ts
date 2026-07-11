import { type QueryClient, queryOptions } from "@tanstack/react-query";

import {
  ACTIVE_ORGANIZATION_MISMATCH_CODE,
  ActiveWorkspaceMismatchError,
} from "../api-errors";
import type { ApiFetcher } from "../context";
import type { EmbeddedItemsOpenAs, PageMetadata } from "./item-relationships";

export type {
  EmbeddedItemsOpenAs,
  ItemRef,
  NavItemKind,
  PageMetadata,
} from "./item-relationships";

export type NotelabAiMode = "instruction" | "skill";

export const notelabAiModeLabels: Record<NotelabAiMode, string> = {
  instruction: "Use as instruction",
  skill: "Use as skill",
};

export const embeddedItemsOpenAsLabels: Record<EmbeddedItemsOpenAs, string> = {
  dialog: "Dialog",
  sidepanel: "Side panel",
};

export const embeddedItemsOpenAsModes: EmbeddedItemsOpenAs[] = [
  "sidepanel",
  "dialog",
];

export type PageDatabaseView = {
  id: string;
  databaseId: string;
  position: number;
  name: string;
  type: string;
  config?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PageDatabase = {
  id: string;
  workspaceId: string;
  pageId: string | null;
  createdById?: string | null;
  name: string;
  config?: unknown;
  createdBy?: PageCreator | null;
  deletedBy?: PageCreator | null;
  isFavorite?: boolean;
  lastVisitedAt?: string | null;
  views: PageDatabaseView[];
  deletedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageItemPlacement = {
  id: string;
  workspaceId: string;
  parentKind: "page" | "database";
  parentId: string;
  itemKind: "page" | "database";
  itemId: string;
  placementKind: "primary" | "linked" | "database_row";
  sourceRowId?: string | null;
  position: number;
};

export type Page = {
  id: string;
  createdBy?: PageCreator | null;
  deletedBy?: PageCreator | null;
  isFavorite?: boolean;
  isTeamspace?: boolean;
  lastVisitedAt?: string | null;
  workspaceId: string;
  createdById?: string | null;
  type: string;
  name: string;
  parentPageId?: string | null;
  url: string;
  content?: unknown;
  metadata?: PageMetadata | null;
  deletedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageNavigationPayload = {
  databases: PageDatabase[];
  pages: Page[];
  placements: PageItemPlacement[];
};

export function getPrimaryPageParentId(
  placements: PageItemPlacement[],
  pageId: string,
) {
  return (
    placements.find(
      (placement) =>
        placement.itemKind === "page" &&
        placement.itemId === pageId &&
        placement.placementKind === "primary",
    )?.parentId ?? null
  );
}

export type PageCreator = {
  email: string;
  id: string;
  image?: string | null;
  name: string;
};

export type NotelabAiPageSummary = {
  id: string;
  name: string;
  workspaceId: string;
  updatedAt: string;
  url: string;
  metadata: {
    emoji?: string | null;
    notelabai: NotelabAiMode | null;
  };
};

export function usesUserFullWidthPreference(
  metadata: PageMetadata | null | undefined,
) {
  return metadata?.useUserFullWidthPreference !== false;
}

export function resolvePageFullWidth(
  page: { metadata?: PageMetadata | null } | null | undefined,
  userFullWidthPreference: boolean | null | undefined,
) {
  const metadata = page?.metadata ?? null;

  if (usesUserFullWidthPreference(metadata)) {
    return Boolean(userFullWidthPreference);
  }

  return Boolean(metadata?.fullWidth);
}

export function usesUserEmbeddedItemsPreference(
  metadata: PageMetadata | null | undefined,
) {
  return metadata?.useUserEmbeddedItemsPreference !== false;
}

export function resolveEmbeddedItemsOpenAs(
  page: { metadata?: PageMetadata | null } | null | undefined,
  userEmbeddedItemsPreference: EmbeddedItemsOpenAs | null | undefined,
) {
  const metadata = page?.metadata ?? null;

  if (usesUserEmbeddedItemsPreference(metadata)) {
    return userEmbeddedItemsPreference ?? "sidepanel";
  }

  return metadata?.embeddedItemsOpenAs ?? "sidepanel";
}

export type PageProperty = {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  config?: unknown;
  deletedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PagePropertyValue = {
  id: string;
  pageId: string;
  propertyId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PagePropertiesPayload = {
  properties: PageProperty[];
  values: PagePropertyValue[];
};

export type CommentAuthor = {
  email: string;
  id: string;
  image?: string | null;
  name: string;
};

export type PageCommentThread = {
  id: string;
  workspaceId: string;
  pageId: string;
  createdById?: string | null;
  resolvedAt?: string | null;
  resolvedById?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
};

export type PageCommentReaction = {
  count: number;
  emoji: string;
  reactedByMe: boolean;
};

export type PageCommentMessage = {
  id: string;
  threadId: string;
  authorId?: string | null;
  author?: CommentAuthor | null;
  body: string;
  editedAt?: string | null;
  reactions: PageCommentReaction[];
  createdAt: string;
  updatedAt: string;
};

export type PageCommentsPayload = {
  comments: PageCommentMessage[];
  thread: PageCommentThread | null;
};

export type PageThreadsPayload = {
  threads: Array<{
    commentCount: number;
    thread: PageCommentThread;
  }>;
};

export type AccessLevel = "view" | "edit" | "full";

export type AccessTargetType = "public" | "user" | "team";

export type PageAccessRule = {
  id: string;
  workspaceId: string;
  pageId: string;
  targetType: AccessTargetType;
  targetId: string;
  accessLevel: AccessLevel;
  createdAt: string;
  updatedAt: string;
};

export type PageAccessPayload = {
  access: PageAccessRule[];
};

export type PageAccessTargetMember = {
  email: string;
  id: string;
  memberId: string;
  name: string;
  role: string;
};

export type PageAccessTargetTeam = {
  id: string;
  name: string;
};

export type PageAccessTargetsPayload = {
  members: PageAccessTargetMember[];
  teams: PageAccessTargetTeam[];
};

export type PagePersonAccessTargetsPayload = {
  members: PageAccessTargetMember[];
};

export type PagesDeletedFilter = "active" | "only";

export const pagesQueryKey = (
  workspaceId: string | null | undefined,
  deleted: PagesDeletedFilter = "active",
) => ["pages", workspaceId ?? "none", "nav", deleted] as const;

export const pagesRootQueryKey = () => ["pages"] as const;

export const pagesNavRootQueryKey = (workspaceId: string | null | undefined) =>
  ["pages", workspaceId ?? "none", "nav"] as const;

export const notelabAiPagesQueryKey = (
  workspaceId: string | null | undefined,
) => ["pages", workspaceId ?? "none", "notelab-ai"] as const;

export const pageQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none"] as const;

export const pageRootQueryKey = () => ["page"] as const;

export type PageDetail = {
  accessLevel?: AccessLevel | null;
  page: Page;
};

export function getPageFromDetail(
  detail: PageDetail | Page | null | undefined,
) {
  if (!detail || typeof detail !== "object") {
    return null;
  }

  if ("page" in detail) {
    return detail.page;
  }

  return detail as Page;
}

export const pagePropertiesQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none", "properties"] as const;

export const pageCommentsQueryKey = (
  pageId: string | null | undefined,
  threadId?: string | null,
) => ["page", pageId ?? "none", "comments", threadId ?? "active"] as const;

export const pageThreadsQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none", "threads"] as const;

export const pageAccessQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none", "access"] as const;

export const pageAccessTargetsQueryKey = (
  workspaceId: string | null | undefined,
) => ["pages", workspaceId ?? "none", "access-targets"] as const;

export const pagePersonAccessTargetsQueryKey = (
  pageId: string | null | undefined,
) => ["page", pageId ?? "none", "access-targets"] as const;

export const pagesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter },
) =>
  queryOptions({
    queryKey: pagesQueryKey(workspaceId, options?.deleted ?? "active"),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) {
        return { databases: [], pages: [], placements: [] };
      }

      try {
        const params = new URLSearchParams({
          fields: "nav",
          workspaceId,
        });

        if (options?.deleted === "only") {
          params.set("deleted", "only");
        }

        const result = await apiFetch<{
          databases?: PageDatabase[];
          placements?: PageItemPlacement[];
          pages: Page[];
        }>(`/pages?${params.toString()}`, { method: "GET", signal });

        return {
          databases: result.databases ?? [],
          pages: result.pages,
          placements: result.placements ?? [],
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return { databases: [], pages: [], placements: [] };
        }

        throw error;
      }
    },
  });

export const notelabAiPagesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: notelabAiPagesQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) {
        return [];
      }

      try {
        const params = new URLSearchParams({
          fields: "summary",
          notelabai: "instruction,skill",
          workspaceId,
        });
        const result = await apiFetch<{ pages: NotelabAiPageSummary[] }>(
          `/pages?${params.toString()}`,
          { method: "GET", signal },
        );

        return result.pages;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return [];
        }

        throw error;
      }
    },
  });

export const pageQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pageQueryKey(pageId),
    enabled: Boolean(pageId),
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<PageDetail | null> => {
      if (!pageId) {
        throw new Error("pageId is required");
      }

      try {
        const result = await apiFetch<{
          accessLevel?: AccessLevel;
          page: Page;
        }>(`/pages/${pageId}`, { method: "GET", signal });

        return {
          accessLevel: result.accessLevel ?? null,
          page: result.page,
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 409 &&
          "body" in error &&
          error.body &&
          typeof error.body === "object" &&
          "code" in error.body &&
          error.body.code === ACTIVE_ORGANIZATION_MISMATCH_CODE &&
          "workspaceId" in error.body &&
          typeof error.body.workspaceId === "string"
        ) {
          const mismatchBody = error.body as {
            error?: unknown;
            workspaceId: string;
          };
          const message =
            typeof mismatchBody.error === "string"
              ? mismatchBody.error
              : undefined;

          throw new ActiveWorkspaceMismatchError(
            mismatchBody.workspaceId,
            message,
          );
        }

        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error.status === 401 || error.status === 403 || error.status === 404)
        ) {
          return null;
        }

        throw error;
      }
    },
  });

export async function ensurePageDetail(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  pageId: string,
) {
  return queryClient.ensureQueryData(pageQueryOptions(apiFetch, pageId));
}

export const pageAccessQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pageAccessQueryKey(pageId),
    enabled: Boolean(pageId),
    queryFn: async ({ signal }) => {
      if (!pageId) {
        return { access: [] };
      }

      try {
        return await apiFetch<PageAccessPayload>(`/pages/${pageId}/access`, {
          method: "GET",
          signal,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 403
        ) {
          return { access: [] };
        }

        throw error;
      }
    },
  });

export const pageAccessTargetsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pageAccessTargetsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) {
        return { members: [], teams: [] };
      }

      return apiFetch<PageAccessTargetsPayload>(
        `/workspaces/${workspaceId}/access-targets`,
        { method: "GET", signal },
      );
    },
  });

export const pagePersonAccessTargetsQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pagePersonAccessTargetsQueryKey(pageId),
    enabled: Boolean(pageId),
    queryFn: async ({ signal }) => {
      if (!pageId) {
        return { members: [] };
      }

      return apiFetch<PagePersonAccessTargetsPayload>(
        `/pages/${pageId}/access-targets`,
        { method: "GET", signal },
      );
    },
  });

export const pagePropertiesQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pagePropertiesQueryKey(pageId),
    enabled: Boolean(pageId),
    queryFn: async ({ signal }) => {
      if (!pageId) {
        throw new Error("pageId is required");
      }

      return apiFetch<PagePropertiesPayload>(`/pages/${pageId}/properties`, {
        method: "GET",
        signal,
      });
    },
  });

export const pageCommentsQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
  threadId?: string | null,
  enabled = true,
) =>
  queryOptions({
    queryKey: pageCommentsQueryKey(pageId, threadId),
    enabled: Boolean(pageId) && enabled,
    queryFn: async ({ signal }) => {
      if (!pageId) {
        return { comments: [], thread: null };
      }

      const url = threadId
        ? `/pages/${pageId}/comments?threadId=${encodeURIComponent(threadId)}`
        : `/pages/${pageId}/comments`;

      return apiFetch<PageCommentsPayload>(url, { method: "GET", signal });
    },
  });

export const pageThreadsQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
  enabled = true,
) =>
  queryOptions({
    queryKey: pageThreadsQueryKey(pageId),
    enabled: Boolean(pageId) && enabled,
    queryFn: async ({ signal }) => {
      if (!pageId) {
        return { threads: [] };
      }

      return apiFetch<PageThreadsPayload>(`/pages/${pageId}/threads`, {
        method: "GET",
        signal,
      });
    },
  });

export function getPageEmoji(page: Pick<Page, "metadata">) {
  return page.metadata?.emoji ?? null;
}

export function getPageCover(page: Pick<Page, "metadata">) {
  return page.metadata?.cover ?? null;
}
