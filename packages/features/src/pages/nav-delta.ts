import type { Page, PageDatabase, PageItemPlacement, PageNavigationPayload } from "./contracts";

export type NavDelta = {
  removeDatabaseIds?: string[];
  removePlacementIds?: string[];
  removePageIds?: string[];
  upsertDatabases?: Omit<PageDatabase, "actorState" | "isFavorite" | "metadataState">[];
  upsertPlacements?: PageItemPlacement[];
  upsertPages?: Page[];
};

function upsertById<T extends { id: string }>(items: T[] | undefined, next: T) {
  const result = [...(items ?? [])];
  const index = result.findIndex((item) => item.id === next.id);

  if (index >= 0) {
    result[index] = { ...result[index], ...next };
  } else {
    result.push(next);
  }

  return result;
}

function removeByIds<T extends { id: string }>(items: T[] | undefined, ids: Set<string>) {
  return (items ?? []).filter((item) => !ids.has(item.id));
}

export function applyNavDelta(
  navigation: PageNavigationPayload | undefined,
  delta: NavDelta | null | undefined,
) {
  if (!navigation || !delta) {
    return navigation;
  }

  const removePageIds = new Set(delta.removePageIds ?? []);
  const removePlacementIds = new Set(delta.removePlacementIds ?? []);
  let pages = navigation.pages.filter((page) => !removePageIds.has(page.id));
  const databases = navigation.databases;
  let placements = removeByIds(navigation.placements, removePlacementIds);

  for (const page of delta.upsertPages ?? []) {
    pages = upsertById(pages, page);
  }

  // Database deltas have no atomic revision envelope. Their owning adapter
  // refreshes GET snapshots; only controller intentions may project over them.

  for (const placement of delta.upsertPlacements ?? []) {
    placements = upsertById(placements, placement);
  }

  return { databases, pages, placements };
}

export function applyItemVisitToNav(
  navigation: PageNavigationPayload | undefined,
  visit: {
    itemId: string;
    itemKind: "database" | "page";
    lastVisitedAt: string;
  },
) {
  if (!navigation) {
    return navigation;
  }

  if (visit.itemKind === "page") {
    return {
      ...navigation,
      pages: navigation.pages.map((page) =>
        page.id === visit.itemId ? { ...page, lastVisitedAt: visit.lastVisitedAt } : page,
      ),
    };
  }

  return {
    ...navigation,
    databases: navigation.databases.map((database) =>
      database.id === visit.itemId ? { ...database, lastVisitedAt: visit.lastVisitedAt } : database,
    ),
  };
}

export function applyPageFavoriteToNav(navigation: PageNavigationPayload | undefined, page: Page) {
  if (!navigation) {
    return navigation;
  }

  return {
    ...navigation,
    pages: navigation.pages.map((current) =>
      current.id === page.id ? { ...current, ...page, isFavorite: page.isFavorite } : current,
    ),
  };
}
