import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useZilobaseFeatures } from "../shared/context";
import { useDatabase } from "../databases/query-hooks";
import { useDatabaseIdForRowPage } from "../databases/use-database-id-for-row-page";
import { buildPagePropertiesPayloadFromDatabase } from "../databases/row-page-properties";
import {
  getPageFromDetail,
  pageAccessQueryOptions,
  pageAccessTargetsQueryOptions,
  pageGuestInvitationQueryOptions,
  pageGuestInvitationsQueryOptions,
  pageGuestRequestsQueryOptions,
  pagePersonAccessTargetsQueryOptions,
  pagePropertiesQueryOptions,
  pageQueryOptions,
  pagesQueryOptions,
  zilobaseAiPagesQueryOptions,
  type PagesDeletedFilter,
} from "./queries";

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
