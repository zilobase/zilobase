import { normalizeAccessReferences, revokeAccessReferences } from "./access-references";
import { normalizeAiPageReferences } from "./summary-references";
import { normalizeNavigationReference } from "./navigation-references";
import { normalizePageProperties } from "./property-cache";
import type {
  ZilobaseAiMode,
  PageDatabase,
  PageItemPlacement,
  Page,
  ZilobaseAiPageSummary,
  PagePropertiesPayload,
  AccessLevel,
  PageAccessPayload,
  PageAccessTargetsPayload,
  PagePersonAccessTargetsPayload,
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
import type { EmbeddedItemsOpenAs } from "./item-relationships";
import { sharedClient } from "../data/client";
import { stageAuthorizedPages, type PageDetailReference } from "./cache";

export const zilobaseAiModeLabels: Record<ZilobaseAiMode, string> = {
  instruction: "Use as instruction",
  skill: "Use as skill",
};

export const embeddedItemsOpenAsLabels: Record<EmbeddedItemsOpenAs, string> = {
  dialog: "Dialog",
  sidepanel: "Side panel",
};

export const embeddedItemsOpenAsModes: EmbeddedItemsOpenAs[] = ["sidepanel", "dialog"];

export function getPrimaryPageParentId(placements: PageItemPlacement[], pageId: string) {
  return (
    placements.find(
      (placement) =>
        placement.itemKind === "page" &&
        placement.itemId === pageId &&
        placement.placementKind === "primary",
    )?.parentId ?? null
  );
}

export function resolvePageFullWidth(
  page:
    | {
        publishedOwnerPreferences?: { pageFullWidth: boolean } | null;
      }
    | null
    | undefined,
  userFullWidthPreference: boolean | null | undefined,
) {
  return Boolean(page?.publishedOwnerPreferences?.pageFullWidth ?? userFullWidthPreference);
}

export function resolveEmbeddedItemsOpenAs(
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

export const zilobaseAiPagesQueryKey = (workspaceId: string | null | undefined) =>
  ["pages", workspaceId ?? "none", "zilobase-ai"] as const;

export const pageQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none"] as const;

export const pageRootQueryKey = () => ["page"] as const;

export function getPageFromDetail(detail: PageDetail | Page | null | undefined) {
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

export const pageAccessTargetsQueryKey = (workspaceId: string | null | undefined) =>
  ["pages", workspaceId ?? "none", "access-targets"] as const;

export const pagePersonAccessTargetsQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none", "access-targets"] as const;

export const pageGuestInvitationsQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none", "guest-invitations"] as const;

export const pageGuestInvitationQueryKey = (invitationId: string | null | undefined) =>
  ["page-guest-invitation", invitationId ?? "none"] as const;

export const pageGuestRequestsQueryKey = (pageId: string | null | undefined) =>
  ["page", pageId ?? "none", "guest-requests"] as const;

export const pagesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter },
) =>
  queryOptions({
    queryKey: pagesQueryKey(workspaceId, options?.deleted ?? "active"),
    enabled: Boolean(workspaceId),
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    // Router guards await this same query imperatively. Do not consume the
    // observer-owned signal or a temporary React unsubscribe can cancel the
    // promise that is still required by the router.
    queryFn: async ({ client }) => {
      if (!workspaceId) {
        return { databases: [], pages: [], placements: [] };
      }

      const read = await sharedClient(client).captureRead();
      const retained = client.getQueryData(
        pagesQueryKey(workspaceId, options?.deleted ?? "active"),
      );
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
        }>(`/pages?${params.toString()}`, { method: "GET" });

        return normalizeNavigationReference(client, read, workspaceId, {
          databases: result.databases ?? [],
          pages: result.pages,
          placements: result.placements ?? [],
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error.status === 401 || error.status === 403)
        ) {
          if (sharedClient(client).isCurrent(read)) sharedClient(client).revokeReferences(retained);
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
    queryFn: async ({ client, signal }) => {
      if (!workspaceId) {
        return [];
      }

      try {
        const read = await sharedClient(client).captureRead();
        const params = new URLSearchParams({
          fields: "summary",
          zilobaseai: "instruction,skill",
          workspaceId,
        });
        const result = await apiFetch<{ pages: ZilobaseAiPageSummary[] }>(
          `/pages?${params.toString()}`,
          { method: "GET", signal },
        );

        return normalizeAiPageReferences(client, read, workspaceId, result.pages);
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

export const pageQueryOptions = (apiFetch: ApiFetcher, pageId: string | null | undefined) =>
  queryOptions({
    queryKey: pageQueryKey(pageId),
    enabled: Boolean(pageId),
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
    // Public-share guards and page components can consume this request at the
    // same time, so its lifetime cannot belong to the component observer.
    queryFn: async ({ client }): Promise<PageDetailReference | null> => {
      if (!pageId) {
        throw new Error("pageId is required");
      }

      const read = await sharedClient(client).captureRead();
      const retained = client.getQueryData<PageDetailReference>(pageQueryKey(pageId));
      try {
        const result = await apiFetch<{
          accessLevel?: AccessLevel;
          databaseIds?: string[];
          page: Page;
          viewerType?: PageDetail["viewerType"];
        }>(`/pages/${pageId}`, { method: "GET" });

        sharedClient(client).revalidateScope(
          read,
          retained,
          result.viewerType === "guest" || result.viewerType === "public"
            ? result.viewerType
            : "account",
          Boolean(retained?.accessLevel && retained.accessLevel !== result.accessLevel),
        );
        return {
          accessLevel: result.accessLevel ?? null,
          databaseIds: result.databaseIds ?? [],
          page: stageAuthorizedPages(
            client,
            read,
            result.page.workspaceId,
            [result.page],
            result.viewerType === "guest" || result.viewerType === "public"
              ? { kind: result.viewerType, id: pageId }
              : undefined,
          )[0]!,
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
          const message = typeof mismatchBody.error === "string" ? mismatchBody.error : undefined;

          throw new ActiveWorkspaceMismatchError(mismatchBody.workspaceId, message);
        }

        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error.status === 401 || error.status === 403 || error.status === 404)
        ) {
          if (sharedClient(client).isCurrent(read)) sharedClient(client).revokeReferences(retained);
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

export const pageAccessQueryOptions = (apiFetch: ApiFetcher, pageId: string | null | undefined) =>
  queryOptions({
    queryKey: pageAccessQueryKey(pageId),
    refetchOnWindowFocus: "always",
    enabled: Boolean(pageId),
    queryFn: async ({ client, signal }) => {
      if (!pageId) {
        return { access: [] };
      }

      const detail = client.getQueryData<PageDetailReference>(pageQueryKey(pageId));
      const read = await sharedClient(client).captureRead(detail?.page.cacheId);
      const previous = client.getQueryData(pageAccessQueryKey(pageId));
      try {
        const result = await apiFetch<PageAccessPayload>(`/pages/${pageId}/access`, {
          method: "GET",
          signal,
        });
        return normalizeAccessReferences(client, read, "page", pageId, result.access);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 403
        ) {
          revokeAccessReferences(client, "page", previous, read);
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

      return apiFetch<PageAccessTargetsPayload>(`/workspaces/${workspaceId}/access-targets`, {
        method: "GET",
        signal,
      });
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

      return apiFetch<PagePersonAccessTargetsPayload>(`/pages/${pageId}/access-targets`, {
        method: "GET",
        signal,
      });
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
        if (error && typeof error === "object" && "status" in error && error.status === 403) {
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
        if (error && typeof error === "object" && "status" in error && error.status === 403) {
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
    queryFn: async ({ client, signal }) => {
      if (!pageId) {
        throw new Error("pageId is required");
      }

      const previous = client.getQueryData<PageDetailReference>(pageQueryKey(pageId));
      const read = await sharedClient(client).captureRead(previous?.page.cacheId);
      const payload = await apiFetch<PagePropertiesPayload>(`/pages/${pageId}/properties`, {
        method: "GET",
        signal,
      });
      sharedClient(client).revalidateScope(
        read,
        previous,
        "viewerType" in payload && payload.viewerType === "guest" ? "guest" : "account",
      );
      return normalizePageProperties(client, read, pageId, payload);
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
