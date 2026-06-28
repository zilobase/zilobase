import type {
  Page,
  PageDatabase,
  PageItemPlacement,
} from "./queries"

export type NavDelta = {
  removeDatabaseIds?: string[]
  removePlacementIds?: string[]
  removePageIds?: string[]
  upsertDatabases?: PageDatabase[]
  upsertPlacements?: PageItemPlacement[]
  upsertPages?: Page[]
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
  pages: Page[] | undefined,
  delta: NavDelta | null | undefined,
) {
  if (!pages || !delta) {
    return pages
  }

  const removePageIds = new Set(delta.removePageIds ?? [])
  const removeDatabaseIds = new Set(delta.removeDatabaseIds ?? [])
  const removePlacementIds = new Set(delta.removePlacementIds ?? [])
  let next = pages.filter((page) => !removePageIds.has(page.id))

  for (const page of delta.upsertPages ?? []) {
    next = upsertById(next, page)
  }

  next = next.map((page) => ({
    ...page,
    databases: removeByIds(page.databases, removeDatabaseIds),
    navigationPlacements: removeByIds(
      page.navigationPlacements,
      removePlacementIds,
    ),
  }))

  for (const database of delta.upsertDatabases ?? []) {
    next = next.map((page) =>
      page.id === database.pageId
        ? {
            ...page,
            databases: upsertById(page.databases, database),
          }
        : page,
    )
  }

  for (const placement of delta.upsertPlacements ?? []) {
    next = next.map((page) => ({
      ...page,
      navigationPlacements: upsertById(
        page.navigationPlacements,
        placement,
      ),
    }))
  }

  return next
}

export function applyItemVisitToNav(
  pages: Page[] | undefined,
  visit: {
    itemId: string
    itemKind: "database" | "page"
    lastVisitedAt: string
  },
) {
  if (!pages) {
    return pages
  }

  if (visit.itemKind === "page") {
    return pages.map((page) =>
      page.id === visit.itemId
        ? { ...page, lastVisitedAt: visit.lastVisitedAt }
        : page,
    )
  }

  return pages.map((page) => ({
    ...page,
    databases: page.databases?.map((database) =>
      database.id === visit.itemId
        ? { ...database, lastVisitedAt: visit.lastVisitedAt }
        : database,
    ),
  }))
}

export function applyPageFavoriteToNav(
  pages: Page[] | undefined,
  page: Page,
) {
  if (!pages) {
    return pages
  }

  return pages.map((current) =>
    current.id === page.id
      ? { ...current, ...page, isFavorite: page.isFavorite }
      : current,
  )
}

export function applyDatabaseFavoriteToNav(
  pages: Page[] | undefined,
  database: PageDatabase,
) {
  if (!pages) {
    return pages
  }

  return pages.map((page) => ({
    ...page,
    databases: page.databases?.map((current) =>
      current.id === database.id
        ? { ...current, ...database, isFavorite: database.isFavorite }
        : current,
    ),
  }))
}
