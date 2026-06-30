import type { QueryClient } from "@tanstack/react-query"

import type { ApiFetcher } from "./context"
import { databaseQueryKey } from "./databases/queries"
import {
  notelabAiWorkspacesQueryKey,
  workspaceQueryKey,
  workspacesQueryKey,
  type Workspace,
  type WorkspaceDetail,
} from "./workspaces/queries"

export type DeletedItemIds = {
  deletedDatabaseIds: string[]
  deletedWorkspaceIds: string[]
}

export function isWorkspaceFavoriteInCache(
  queryClient: QueryClient,
  workspaceId: string,
  organizationId?: string | null,
) {
  return Boolean(getWorkspaceFromCache(queryClient, workspaceId, organizationId)?.isFavorite)
}

export async function favoriteWorkspacePages({
  apiFetch,
  organizationId,
  pageIds,
  queryClient,
}: {
  apiFetch: ApiFetcher
  organizationId: string
  pageIds: string[]
  queryClient: QueryClient
}) {
  const uniquePageIds = [...new Set(pageIds)].filter(Boolean)

  if (uniquePageIds.length === 0) {
    return
  }

  const results = await Promise.all(
    uniquePageIds.map((pageId) =>
      apiFetch<{ workspace: Workspace }>(`/workspaces/${pageId}/favorite`, {
        method: "PUT",
      }),
    ),
  )

  for (const { workspace } of results) {
    setWorkspaceDetailCache(queryClient, workspace)
  }

  await queryClient.invalidateQueries({
    queryKey: workspacesQueryKey(organizationId),
  })
}

export async function invalidateDeletedItems({
  includeNotelabAi = false,
  organizationId,
  queryClient,
  result,
}: {
  includeNotelabAi?: boolean
  organizationId: string | null | undefined
  queryClient: QueryClient
  result: DeletedItemIds
}) {
  if (!organizationId) {
    return
  }

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: workspacesQueryKey(organizationId),
    }),
    includeNotelabAi
      ? queryClient.invalidateQueries({
          queryKey: notelabAiWorkspacesQueryKey(organizationId),
        })
      : Promise.resolve(),
  ])

  for (const databaseId of result.deletedDatabaseIds) {
    queryClient.removeQueries({ queryKey: databaseQueryKey(databaseId) })
  }

  for (const workspaceId of result.deletedWorkspaceIds) {
    queryClient.removeQueries({ queryKey: workspaceQueryKey(workspaceId) })
  }
}

export function setWorkspaceDetailCache(
  queryClient: QueryClient,
  workspace: Workspace,
) {
  queryClient.setQueryData<WorkspaceDetail | null>(
    workspaceQueryKey(workspace.id),
    (current) => ({
      accessLevel: current?.accessLevel ?? null,
      workspace,
    }),
  )
}

function getWorkspaceFromCache(
  queryClient: QueryClient,
  workspaceId: string,
  organizationId?: string | null,
) {
  const detail = queryClient.getQueryData<WorkspaceDetail | null>(
    workspaceQueryKey(workspaceId),
  )

  if (detail?.workspace.id === workspaceId) {
    return detail.workspace
  }

  const organizationWorkspaces = organizationId
    ? queryClient.getQueryData<Workspace[]>(workspacesQueryKey(organizationId))
    : null
  const workspace = organizationWorkspaces?.find(
    (candidate) => candidate.id === workspaceId,
  )

  if (workspace) {
    return workspace
  }

  for (const [, workspaces] of queryClient.getQueriesData<Workspace[]>({
    queryKey: ["workspaces"],
  })) {
    const workspace = workspaces?.find(
      (candidate) => candidate.id === workspaceId,
    )

    if (workspace) {
      return workspace
    }
  }

  return null
}
