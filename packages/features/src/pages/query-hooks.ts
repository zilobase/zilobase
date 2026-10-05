import { resolvePageAccessReferences } from "./access-references";
import { resolveAiPageReferences } from "./summary-references";
import { resolvePageProperties } from "./property-cache";
import { useMemo } from "react";
import { useSharedDataRevision } from "../data/react";
import { resolveNavigationReference, resolvePageDetailReference } from "./cache";
import { useQuery } from "@tanstack/react-query";

import { useZilobaseFeatures } from "../shared/context";
import {
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
} from "./queries";
import type { PagesDeletedFilter } from "./contracts";

export function usePages(
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter; enabled?: boolean },
) {
  const navigation = usePageNavigation(workspaceId, options);
  return { ...navigation, data: navigation.data?.pages };
}

export function usePageNavigation(
  workspaceId: string | null | undefined,
  options?: { deleted?: PagesDeletedFilter; enabled?: boolean },
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  const query = useQuery({
    ...pagesQueryOptions(apiFetch, workspaceId, {
      deleted: options?.deleted,
    }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
  });
  const revision = useSharedDataRevision(queryClient);
  const resolved = useMemo(
    () => (query.data ? resolveNavigationReference(queryClient, query.data) : undefined),
    [queryClient, query.data, revision],
  );
  const data = resolved;
  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
  };
}

export function useZilobaseAiPages(workspaceId: string | null | undefined) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery(zilobaseAiPagesQueryOptions(apiFetch, workspaceId));
  useSharedDataRevision(queryClient);
  return {
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
    data: query.data && resolveAiPageReferences(queryClient, query.data),
  };
}

type PageQueryHookOptions = {
  refetchOnMount?: boolean;
};

export function usePage(pageId: string | null | undefined, options?: PageQueryHookOptions) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    refetchOnMount: options?.refetchOnMount ?? "always",
  });
  const revision = useSharedDataRevision(queryClient);
  const data = useMemo(
    () => resolvePageDetailReference(queryClient, query.data)?.page ?? null,
    [queryClient, query.data, revision],
  );
  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
  };
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
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery(pageAccessQueryOptions(apiFetch, pageId));
  useSharedDataRevision(queryClient);
  return {
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
    data: query.data && resolvePageAccessReferences(queryClient, query.data),
  };
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

export function usePageGuestInvitation(invitationId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(pageGuestInvitationQueryOptions(apiFetch, invitationId));
}

type PagePropertiesOptions = {
  databaseId?: string | null;
};

export function usePageProperties(
  pageId: string | null | undefined,
  _options?: PagePropertiesOptions,
) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const query = useQuery({
    ...pagePropertiesQueryOptions(apiFetch, pageId),
    enabled: Boolean(pageId),
  });
  const revision = useSharedDataRevision(queryClient);
  const data = useMemo(
    () => resolvePageProperties(queryClient, query.data),
    [queryClient, query.data, revision],
  );
  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    status: query.status,
    refetch: query.refetch,
  };
}
