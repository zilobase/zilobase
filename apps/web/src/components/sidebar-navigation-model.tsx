import type {
  Page,
  PageDatabase,
  PageDatabaseView,
  PageItemPlacement,
} from "@zilobase/features/pages"
import type { ReactNode } from "react"

import type { SidebarNavItem } from "@/components/sidebar-nav-list"

export type SidebarPageSections = {
  privatePages: SidebarNavItem[]
  teamspacePages: SidebarNavItem[]
}

export type SidebarNavigationIcons = {
  getDatabaseIcon: (database: PageDatabase) => ReactNode
  getDatabaseViewIcon: (view: PageDatabaseView) => ReactNode
  getPageIcon: (page: Page) => ReactNode
}

export function buildSidebarNavigation(
  pages: Page[],
  databases: PageDatabase[],
  placements: PageItemPlacement[],
  icons: SidebarNavigationIcons,
) {
  const activePages = pages.filter(
    (page) => !page.deletedAt && page.type !== "meeting",
  )
  const activeDatabases = databases.filter((database) => !database.deletedAt)
  const sections = buildPageSections(
    activePages,
    activeDatabases,
    placements,
    icons,
  )
  const recents = buildRecentItems(activePages, activeDatabases, icons)
  const favorites = buildFavoriteItems([
    ...sections.privatePages,
    ...sections.teamspacePages,
  ])
  const representedFavoriteIds = new Set<string>()

  favorites.forEach((item) => collectItemIds(item, representedFavoriteIds))
  const detachedFavoritePages = activePages
    .filter(
      (page) => page.isFavorite && !representedFavoriteIds.has(page.id),
    )
    .sort(
      (first, second) =>
        getPageCreatedTime(first) - getPageCreatedTime(second),
    )
  const detachedFavoriteIds = new Set(
    detachedFavoritePages.map((page) => page.id),
  )
  const detachedSections = buildPageSections(
    activePages,
    activeDatabases,
    placements.filter(
      (placement) =>
        placement.itemKind !== "page" ||
        !detachedFavoriteIds.has(placement.itemId),
    ),
    icons,
  )
  const detachedNodesById = new Map(
    [...detachedSections.privatePages, ...detachedSections.teamspacePages].map(
      (item) => [item.id, item],
    ),
  )
  const detachedFavorites = detachedFavoritePages.map(
    (page) => detachedNodesById.get(page.id) ?? createPageNode(page, icons),
  )

  return {
    favorites: [...favorites, ...detachedFavorites],
    recents,
    sections,
  }
}

export function buildRecentItems(
  pages: Page[],
  databases: PageDatabase[],
  icons: SidebarNavigationIcons,
) {
  return [
    ...pages
      .filter((page) => !page.deletedAt && page.lastVisitedAt)
      .map((page) => createPageNode(page, icons)),
    ...databases
      .filter((database) => !database.deletedAt && database.lastVisitedAt)
      .map((database) => createDatabaseNode(database, undefined, icons)),
  ].sort(
    (first, second) =>
      getTimestamp(second.lastVisitedAt) - getTimestamp(first.lastVisitedAt),
  )
}

export function buildPageSections(
  pages: Page[],
  databases: PageDatabase[],
  placements: PageItemPlacement[],
  icons: SidebarNavigationIcons,
): SidebarPageSections {
  const orderedPages = [...pages].sort(
    (first, second) => getPageCreatedTime(first) - getPageCreatedTime(second),
  )
  const pagesById = new Map(orderedPages.map((page) => [page.id, page]))
  const pageNodesById = new Map(
    orderedPages.map((page) => [page.id, createPageNode(page, icons)]),
  )
  const placementsByPageParent = groupPagePlacements(placements)
  const databaseNodesById = new Map(
    databases.map((database) => [
      database.id,
      createDatabaseNode(
        database,
        database.pageId ? pagesById.get(database.pageId) : undefined,
        icons,
      ),
    ]),
  )
  const placedPageIds = new Set<string>()
  const placedDatabaseIds = new Set<string>()
  const databaseRowPageIds = new Set<string>()

  for (const placement of placements) {
    if (placement.itemKind === "page") {
      placedPageIds.add(placement.itemId)
      if (placement.placementKind === "database_row") {
        databaseRowPageIds.add(placement.itemId)
      }
    } else if (placement.parentKind === "page") {
      placedDatabaseIds.add(placement.itemId)
    }
  }

  const buildDatabaseNode = (
    databaseId: string,
    navNodeId: string,
    isLinked = false,
  ): SidebarNavItem | null => {
    const node = databaseNodesById.get(databaseId)

    return node ? { ...node, isLinked, navNodeId } : null
  }

  const visitingPageIds = new Set<string>()
  const buildPageNode = (
    pageId: string,
    navNodeId: string,
    isLinked = false,
  ): SidebarNavItem | null => {
    const node = pageNodesById.get(pageId)

    if (!node) {
      return null
    }

    if (visitingPageIds.has(pageId)) {
      return { ...node, isLinked: true, navNodeId }
    }

    visitingPageIds.add(pageId)
    const pages = (placementsByPageParent.get(pageId) ?? []).flatMap(
      (placement) => {
        if (placement.itemKind === "page") {
          if (placement.itemId === pageId) {
            return []
          }
          if (pagesById.get(placement.itemId)?.type === "meeting") {
            return []
          }

          const child = buildPageNode(
            placement.itemId,
            placement.id,
            placement.placementKind !== "primary" ||
              databaseRowPageIds.has(placement.itemId),
          )

          return child ? [child] : []
        }

        const child = buildDatabaseNode(
          placement.itemId,
          placement.id,
          placement.placementKind !== "primary",
        )

        return child ? [child] : []
      },
    )
    visitingPageIds.delete(pageId)

    return { ...node, isLinked, navNodeId, pages }
  }

  const roots = orderedPages.flatMap((page) => {
    if (placedPageIds.has(page.id)) {
      return []
    }

    const node = buildPageNode(page.id, page.id)
    return node ? [node] : []
  })

  for (const database of databases) {
    if (placedDatabaseIds.has(database.id)) {
      continue
    }

    const node = buildDatabaseNode(
      database.id,
      `standalone-database:${database.id}`,
    )
    if (node) {
      roots.push(node)
    }
  }

  return {
    privatePages: roots.filter((page) => !page.isTeamspace),
    teamspacePages: roots.filter((page) => page.isTeamspace),
  }
}

export function buildFavoriteItems(items: SidebarNavItem[]) {
  return items.flatMap(collectFavoriteItems)
}

function createPageNode(
  page: Page,
  icons: SidebarNavigationIcons,
): SidebarNavItem {
  return {
    id: page.id,
    isFavorite: Boolean(page.isFavorite),
    isTeamspace: Boolean(page.isTeamspace),
    lastVisitedAt: page.lastVisitedAt,
    name: page.name,
    emoji: icons.getPageIcon(page),
    zilobaseai: page.metadata?.zilobaseai ?? null,
    pageId: page.id,
    pages: [],
    updatedAt: page.updatedAt,
  }
}

function createDatabaseNode(
  database: PageDatabase,
  page: Page | undefined,
  icons: SidebarNavigationIcons,
): SidebarNavItem {
  return {
    databaseId: database.id,
    id: `database:${database.id}`,
    isDatabase: true,
    isFavorite: Boolean(database.isFavorite),
    isTeamspace: Boolean(page?.isTeamspace),
    lastVisitedAt: database.lastVisitedAt,
    name: database.name,
    emoji: icons.getDatabaseIcon(database),
    pageId: database.pageId,
    pages: [...(database.views ?? [])]
      .sort((first, second) => first.position - second.position)
      .map((view) => ({
        databaseId: database.id,
        databaseViewId: view.id,
        id: `database-view:${view.id}`,
        isDatabaseView: true,
        isTeamspace: Boolean(page?.isTeamspace),
        name: view.name,
        emoji: icons.getDatabaseViewIcon(view),
        pageId: database.pageId,
        navNodeId: `database-view:${database.id}:${view.id}`,
        pages: [],
        updatedAt: view.updatedAt,
      })),
    updatedAt: database.updatedAt,
  }
}

function groupPagePlacements(placements: PageItemPlacement[]) {
  const grouped = new Map<string, PageItemPlacement[]>()

  for (const placement of placements) {
    if (placement.parentKind !== "page") {
      continue
    }

    const siblings = grouped.get(placement.parentId)
    if (siblings) {
      siblings.push(placement)
    } else {
      grouped.set(placement.parentId, [placement])
    }
  }

  for (const siblings of grouped.values()) {
    siblings.sort((first, second) =>
      first.position === second.position
        ? first.id.localeCompare(second.id)
        : first.position - second.position,
    )
  }

  return grouped
}

function collectFavoriteItems(item: SidebarNavItem): SidebarNavItem[] {
  if (item.isDatabaseView) {
    return []
  }

  const nestedFavorites = item.pages.flatMap((child) =>
    collectFavoriteItems(child),
  )

  return item.isFavorite
    ? [cloneFavoriteHierarchy(item), ...nestedFavorites]
    : nestedFavorites
}

function cloneFavoriteHierarchy(item: SidebarNavItem): SidebarNavItem {
  return {
    ...item,
    pages: item.pages
      .filter((child) => !child.isDatabaseView)
      .map(cloneFavoriteHierarchy),
  }
}

function collectItemIds(item: SidebarNavItem, ids: Set<string>) {
  ids.add(item.id)
  item.pages.forEach((child) => collectItemIds(child, ids))
}

function getPageCreatedTime(page: Page) {
  const time = new Date(page.createdAt).getTime()
  return Number.isFinite(time) ? time : 0
}

function getTimestamp(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}
