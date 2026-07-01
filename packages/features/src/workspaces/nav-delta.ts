import type {
  Workspace,
  WorkspaceDatabase,
  WorkspaceItemPlacement,
} from "./queries"

export type NavDelta = {
  removeDatabaseIds?: string[]
  removePlacementIds?: string[]
  removeWorkspaceIds?: string[]
  upsertDatabases?: WorkspaceDatabase[]
  upsertPlacements?: WorkspaceItemPlacement[]
  upsertWorkspaces?: Workspace[]
}

function upsertById<T extends { id: string }>(items: T[] | undefined, next: T) {
  const result = [...(items ?? [])]
  const index = result.findIndex((item) => item.id === next.id)

  if (index >= 0) {
    result[index] = { ...result[index], ...next }
  } else {
    result.push(next)
  }

  return result
}

function removeByIds<T extends { id: string }>(
  items: T[] | undefined,
  ids: Set<string>,
) {
  return (items ?? []).filter((item) => !ids.has(item.id))
}

export function applyNavDelta(
  workspaces: Workspace[] | undefined,
  delta: NavDelta | null | undefined,
) {
  if (!workspaces || !delta) {
    return workspaces
  }

  const removeWorkspaceIds = new Set(delta.removeWorkspaceIds ?? [])
  const removeDatabaseIds = new Set(delta.removeDatabaseIds ?? [])
  const removePlacementIds = new Set(delta.removePlacementIds ?? [])
  let next = workspaces.filter((workspace) => !removeWorkspaceIds.has(workspace.id))

  for (const workspace of delta.upsertWorkspaces ?? []) {
    next = upsertById(next, workspace)
  }

  next = next.map((workspace) => ({
    ...workspace,
    databases: removeByIds(workspace.databases, removeDatabaseIds),
    navigationPlacements: removeByIds(
      workspace.navigationPlacements,
      removePlacementIds,
    ),
  }))

  for (const database of delta.upsertDatabases ?? []) {
    next = next.map((workspace) =>
      workspace.id === database.pageId
        ? {
            ...workspace,
            databases: upsertById(workspace.databases, database),
          }
        : workspace,
    )
  }

  for (const placement of delta.upsertPlacements ?? []) {
    next = next.map((workspace) => ({
      ...workspace,
      navigationPlacements: upsertById(
        workspace.navigationPlacements,
        placement,
      ),
    }))
  }

  return next
}

export function applyItemVisitToNav(
  workspaces: Workspace[] | undefined,
  visit: {
    itemId: string
    itemKind: "database" | "workspace"
    lastVisitedAt: string
  },
) {
  if (!workspaces) {
    return workspaces
  }

  if (visit.itemKind === "workspace") {
    return workspaces.map((workspace) =>
      workspace.id === visit.itemId
        ? { ...workspace, lastVisitedAt: visit.lastVisitedAt }
        : workspace,
    )
  }

  return workspaces.map((workspace) => ({
    ...workspace,
    databases: workspace.databases?.map((database) =>
      database.id === visit.itemId
        ? { ...database, lastVisitedAt: visit.lastVisitedAt }
        : database,
    ),
  }))
}

export function applyWorkspaceFavoriteToNav(
  workspaces: Workspace[] | undefined,
  workspace: Workspace,
) {
  if (!workspaces) {
    return workspaces
  }

  return workspaces.map((current) =>
    current.id === workspace.id
      ? { ...current, ...workspace, isFavorite: workspace.isFavorite }
      : current,
  )
}

export function applyDatabaseFavoriteToNav(
  workspaces: Workspace[] | undefined,
  database: WorkspaceDatabase,
) {
  if (!workspaces) {
    return workspaces
  }

  return workspaces.map((workspace) => ({
    ...workspace,
    databases: workspace.databases?.map((current) =>
      current.id === database.id
        ? { ...current, ...database, isFavorite: database.isFavorite }
        : current,
    ),
  }))
}
