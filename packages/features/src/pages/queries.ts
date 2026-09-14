import type { ZilobaseAiMode, PageDatabase, PageItemPlacement, Page, ZilobaseAiPageSummary, PagePropertiesPayload, AccessLevel, PageAccessPayload, PageAccessTargetsPayload, PagePersonAccessTargetsPayload, PageGuestInvitation, PageGuestInvitationDetail, PageGuestRequest, PagesDeletedFilter, PageDetail } from "./contracts";
export type {
  ZilobaseAiMode,
  PageDatabaseView,
  PageDatabase,
  PageItemPlacement,
  Page,
  PageNavigationPayload,
  PageCreator,
  ZilobaseAiPageSummary,
  PageProperty,
  PagePropertyValue,
  PagePropertiesPayload,
  PagePropertyPresenceTarget,
  AccessLevel,
  AccessTargetType,
  PageAccessRule,
  PageAccessPayload,
  PageAccessTargetMember,
  PageAccessTargetTeam,
  PageAccessTargetsPayload,
  PagePersonAccessTargetsPayload,
  PageAccessTargetGuest,
  PageGuestInvitation,
  PageGuestInvitationDetail,
  PageGuestRequest,
  PagesDeletedFilter,
  PageDetail,
} from "./contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";

import {
  ACTIVE_ORGANIZATION_MISMATCH_CODE,
  ActiveWorkspaceMismatchError,
} from "../shared/api-errors";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { EmbeddedItemsOpenAs, PageMetadata } from "./item-relationships";

export type {
  EmbeddedItemsOpenAs,
  ItemRef,
  NavItemKind,
  PageIconPosition,
  PageMetadata,
} from "./item-relationships";

export const zilobaseAiModeLabels: Record<ZilobaseAiMode, string> = {
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

export function usesUserFullWidthPreference() {
  return true;
}

export function resolvePageFullWidth(
  page:
    | {
        metadata?: PageMetadata | null;
        publishedOwnerPreferences?: { pageFullWidth: boolean } | null;
      }
    | null
    | undefined,
  userFullWidthPreference: boolean | null | undefined,
) {
  return Boolean(
    page?.publishedOwnerPreferences?.pageFullWidth ?? userFullWidthPreference,
  );
}

export function usesUserEmbeddedItemsPreference() {
  return true;
}

export function resolveEmbeddedItemsOpenAs(
  _page: { metadata?: PageMetadata | null } | null | undefined,
  userEmbeddedItemsPreference: EmbeddedItemsOpenAs | null | undefined,
) {
  return userEmbeddedItemsPreference ?? "sidepanel";
}

export const pagesQueryKey = (
  workspaceId: string | null | undefined,
  deleted: PagesDeletedFilter = "active",
) => ["pages", workspaceId ?? "none", "nav", deleted] as const;

export const pagesRootQueryKey = () => ["pages"] as const;

export const pagesNavRootQueryKey = (workspaceId: string | null | undefined) =>
  ["pages", workspaceId ?? "none", "nav"] as const;

export const zilobaseAiPagesQueryKey = (
  workspaceId: string | null | undefined,
) => ["pages", workspaceId ?? "none", "zilobase-ai"] as const;

export const pageQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none"] as const;

export const pageRootQueryKey = () => ["page"] as const;

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

export const pageAccessQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none", "access"] as const;

export const pageAccessTargetsQueryKey = (
  workspaceId: string | null | undefined,
) => ["pages", workspaceId ?? "none", "access-targets"] as const;

export const pagePersonAccessTargetsQueryKey = (
  pageId: string | null | undefined,
) => ["page", pageId ?? "none", "access-targets"] as const;

export const pageGuestInvitationsQueryKey = (
  pageId: string | null | undefined,
) => ["page", pageId ?? "none", "guest-invitations"] as const;

export const pageGuestInvitationQueryKey = (
  invitationId: string | null | undefined,
) => ["page-guest-invitation", invitationId ?? "none"] as const;

export const pageGuestRequestsQueryKey = (
  pageId: string | null | undefined,
) => ["page", pageId ?? "none", "guest-requests"] as const;

export const pagesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter },
) =>
  queryOptions({
    queryKey: pagesQueryKey(workspaceId, options?.deleted ?? "active"),
    enabled: Boolean(workspaceId),
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
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
          (error.status === 401 || error.status === 403)
        ) {
          return { databases: [], pages: [], placements: [] };
        }

        throw error;
      }
    },
  });

export const zilobaseAiPagesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: zilobaseAiPagesQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) {
        return [];
      }

      try {
        const params = new URLSearchParams({
          fields: "summary",
          zilobaseai: "instruction,skill",
          workspaceId,
        });
        const result = await apiFetch<{ pages: ZilobaseAiPageSummary[] }>(
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
          databaseIds?: string[];
          page: Page;
          viewerType?: PageDetail["viewerType"];
        }>(`/pages/${pageId}`, { method: "GET", signal });

        return {
          accessLevel: result.accessLevel ?? null,
          databaseIds: result.databaseIds ?? [],
          page: result.page,
          viewerType: result.viewerType ?? null,
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
        return { guests: [], members: [] };
      }

      return apiFetch<PagePersonAccessTargetsPayload>(
        `/pages/${pageId}/access-targets`,
        { method: "GET", signal },
      );
    },
  });

export const pageGuestInvitationsQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pageGuestInvitationsQueryKey(pageId),
    enabled: Boolean(pageId),
    queryFn: async ({ signal }) => {
      if (!pageId) return [];
      try {
        const result = await apiFetch<{ invitations: PageGuestInvitation[] }>(
          `/pages/${encodeURIComponent(pageId)}/guest-invitations`,
          { method: "GET", signal },
        );
        return result.invitations;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 403
        ) {
          return [];
        }
        throw error;
      }
    },
  });

export const pageGuestRequestsQueryOptions = (
  apiFetch: ApiFetcher,
  pageId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pageGuestRequestsQueryKey(pageId),
    enabled: Boolean(pageId),
    queryFn: async ({ signal }) => {
      if (!pageId) return [];
      try {
        const result = await apiFetch<{ requests: PageGuestRequest[] }>(
          `/pages/${encodeURIComponent(pageId)}/guest-requests`,
          { method: "GET", signal },
        );
        return result.requests;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 403
        ) {
          return [];
        }
        throw error;
      }
    },
  });

export const pageGuestInvitationQueryOptions = (
  apiFetch: ApiFetcher,
  invitationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: pageGuestInvitationQueryKey(invitationId),
    enabled: Boolean(invitationId),
    queryFn: async ({ signal }) => {
      if (!invitationId) return null;
      const result = await apiFetch<{
        invitation: PageGuestInvitationDetail;
      }>(`/page-guest-invitations/${encodeURIComponent(invitationId)}`, {
        method: "GET",
        signal,
      });
      return result.invitation;
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

export function getPageEmoji(page: Pick<Page, "metadata">) {
  return page.metadata?.emoji ?? null;
}

export function getPageCover(page: Pick<Page, "metadata">) {
  return page.metadata?.cover ?? null;
}

export function getPageIconPosition(page: Pick<Page, "metadata">) {
  return page.metadata?.iconPosition === "inline" ? "inline" : "top";
}
