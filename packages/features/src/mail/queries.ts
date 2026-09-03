import {
  infiniteQueryOptions,
  queryOptions,
} from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/api-fetcher"
import type {
  MailConnection,
  MailLabelRecord,
} from "./contracts"
import type {
  MailDatabaseSyncViewStatus,
  MailFilterExpression,
  MailPropertiesBootstrap,
  MailReminder,
  MailThreadPropertyValuesResponse,
  MailViewGroupsResponse,
  MailViewQueryResponse,
  MailViewsBootstrap,
} from "./organization"

export type MailScope = {
  bindingId: string | null | undefined
  workspaceId: string | null | undefined
}

export const mailKeys = {
  all: ["mail"] as const,
  connection: (workspaceId: string | null | undefined) =>
    [...mailKeys.all, "connection", workspaceId ?? ""] as const,
  databaseSyncStatus: (workspaceId: string, viewId: string) =>
    [...mailKeys.all, "database-sync-status", workspaceId, viewId] as const,
  groups: (scope: MailScope) =>
    [...mailKeys.all, "groups", scope.workspaceId ?? "", scope.bindingId ?? ""] as const,
  group: (scope: MailScope & {
    filter?: MailFilterExpression
    routeId: string
    search: string
  }) => [...mailKeys.groups(scope), scope.routeId, scope.search, scope.filter] as const,
  indexedQueries: (scope: MailScope) =>
    [...mailKeys.all, "indexed-query", scope.workspaceId ?? "", scope.bindingId ?? ""] as const,
  indexedQuery: (scope: MailScope & {
    filter?: MailFilterExpression
    groupKey?: string
    routeId: string
    search: string
  }) => [
    ...mailKeys.indexedQueries(scope),
    scope.routeId,
    scope.search,
    scope.filter,
    scope.groupKey,
  ] as const,
  labels: (scope: MailScope) =>
    [...mailKeys.all, "labels", scope.workspaceId ?? "", scope.bindingId ?? ""] as const,
  properties: (scope: MailScope) =>
    [...mailKeys.all, "properties", scope.workspaceId ?? "", scope.bindingId ?? ""] as const,
  reminders: (scope: MailScope) =>
    [...mailKeys.all, "reminders", scope.workspaceId ?? "", scope.bindingId ?? ""] as const,
  threadProperties: (scope: MailScope, threadId: string | null | undefined) =>
    [...mailKeys.all, "thread-properties", scope.workspaceId ?? "", scope.bindingId ?? "", threadId ?? ""] as const,
  views: (scope: MailScope) =>
    [...mailKeys.all, "views", scope.workspaceId ?? "", scope.bindingId ?? ""] as const,
}

export function mailApiBasePath(workspaceId?: string | null) {
  return `/workspaces/${encodeURIComponent(workspaceId ?? "_missing_workspace_")}/mail`
}

export function invalidateMailListQueries(
  queryClient: {
    invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>
  },
  scope: MailScope,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: mailKeys.indexedQueries(scope) }),
    queryClient.invalidateQueries({ queryKey: mailKeys.groups(scope) }),
  ])
}

export const mailConnectionQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) => queryOptions({
  enabled: Boolean(workspaceId),
  queryFn: ({ signal }) => apiFetch<MailConnection>(
    `${mailApiBasePath(workspaceId)}/connection`,
    { signal },
  ),
  queryKey: mailKeys.connection(workspaceId),
  staleTime: 15_000,
})

export const mailLabelsQueryOptions = (
  apiFetch: ApiFetcher,
  scope: MailScope,
) => queryOptions({
  enabled: Boolean(scope.bindingId && scope.workspaceId),
  queryFn: ({ signal }) => apiFetch<{ labels: MailLabelRecord[] }>(
    `${mailApiBasePath(scope.workspaceId)}/labels`,
    { signal },
  ),
  queryKey: mailKeys.labels(scope),
  staleTime: 30_000,
})

export const mailViewsQueryOptions = (
  apiFetch: ApiFetcher,
  scope: MailScope,
) => queryOptions({
  enabled: Boolean(scope.bindingId && scope.workspaceId),
  queryFn: ({ signal }) => apiFetch<MailViewsBootstrap>(
    `${mailApiBasePath(scope.workspaceId)}/views`,
    { signal },
  ),
  queryKey: mailKeys.views(scope),
  staleTime: 15_000,
})

export const mailPropertiesQueryOptions = (
  apiFetch: ApiFetcher,
  scope: MailScope,
) => queryOptions({
  enabled: Boolean(scope.bindingId && scope.workspaceId),
  queryFn: ({ signal }) => apiFetch<MailPropertiesBootstrap>(
    `${mailApiBasePath(scope.workspaceId)}/properties`,
    { signal },
  ),
  queryKey: mailKeys.properties(scope),
})

export const mailThreadPropertiesQueryOptions = (
  apiFetch: ApiFetcher,
  scope: MailScope & { threadId: string | null },
) => queryOptions({
  enabled: Boolean(scope.bindingId && scope.workspaceId && scope.threadId),
  queryFn: ({ signal }) => apiFetch<MailThreadPropertyValuesResponse>(
    `${mailApiBasePath(scope.workspaceId)}/threads/${encodeURIComponent(scope.threadId!)}/properties`,
    { signal },
  ),
  queryKey: mailKeys.threadProperties(scope, scope.threadId),
})

export const mailRemindersQueryOptions = (
  apiFetch: ApiFetcher,
  scope: MailScope,
) => queryOptions({
  enabled: Boolean(scope.bindingId && scope.workspaceId),
  queryFn: ({ signal }) => apiFetch<{ reminders: MailReminder[] }>(
    `${mailApiBasePath(scope.workspaceId)}/reminders`,
    { signal },
  ),
  queryKey: mailKeys.reminders(scope),
})

export const mailGroupsQueryOptions = (
  apiFetch: ApiFetcher,
  scope: MailScope & {
    enabled: boolean
    filter?: MailFilterExpression
    routeId: string
    search: string
  },
) => queryOptions({
  enabled: scope.enabled && Boolean(scope.bindingId && scope.workspaceId && scope.routeId),
  queryFn: ({ signal }) => apiFetch<MailViewGroupsResponse>(
    `${mailApiBasePath(scope.workspaceId)}/query/groups`,
    {
      body: JSON.stringify({
        filter: scope.filter,
        routeId: scope.routeId,
        search: scope.search || undefined,
      }),
      method: "POST",
      signal,
    },
  ),
  queryKey: mailKeys.group(scope),
})

export const indexedMailViewQueryOptions = (
  apiFetch: ApiFetcher,
  scope: MailScope & {
    enabled: boolean
    filter?: MailFilterExpression
    groupKey?: string
    routeId: string
    search: string
  },
) => infiniteQueryOptions({
  enabled: scope.enabled && Boolean(scope.bindingId && scope.workspaceId && scope.routeId),
  getNextPageParam: (lastPage: MailViewQueryResponse) => lastPage.nextCursor ?? undefined,
  initialPageParam: null as string | null,
  queryFn: ({ pageParam, signal }) => apiFetch<MailViewQueryResponse>(
    `${mailApiBasePath(scope.workspaceId)}/query`,
    {
      body: JSON.stringify({
        cursor: pageParam ?? undefined,
        filter: scope.filter,
        groupKey: scope.groupKey,
        limit: 50,
        routeId: scope.routeId,
        search: scope.search || undefined,
      }),
      method: "POST",
      signal,
    },
  ),
  queryKey: mailKeys.indexedQuery(scope),
})

export const mailDatabaseSyncStatusQueryOptions = (
  apiFetch: ApiFetcher,
  input: { enabled: boolean; viewId: string; workspaceId: string },
) => queryOptions({
  enabled: input.enabled,
  queryFn: ({ signal }) => apiFetch<MailDatabaseSyncViewStatus>(
    `${mailApiBasePath(input.workspaceId)}/views/${encodeURIComponent(input.viewId)}/database-sync-status`,
    { signal },
  ),
  queryKey: mailKeys.databaseSyncStatus(input.workspaceId, input.viewId),
  refetchInterval: 15_000,
})
