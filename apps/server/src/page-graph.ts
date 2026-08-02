export type PageGraphPage = {
  createdById?: string | null;
  id: string;
  name?: string;
};

export type PageGraphPlacement = {
  itemId: string;
  itemKind: string;
  parentId: string;
  parentKind: string;
  placementKind: string;
};

export type PageGraphDatabase = {
  id: string;
  pageId: string;
};

export type PageGraphDatabaseRow = {
  databaseId: string;
  pageId: string;
};

export class PageGraph {
  private readonly childIdsByParentId = new Map<string, Set<string>>();
  private readonly accessParentIdsByChildId = new Map<string, Set<string>>();
  private readonly primaryChildIdsByParentId = new Map<string, Set<string>>();
  private readonly databaseIdsByPageId = new Map<string, string[]>();
  private readonly databasePageIdByDatabaseId = new Map<string, string>();
  private readonly databaseRowPageIdsByDatabaseId = new Map<string, string[]>();
  private readonly pageById: Map<string, PageGraphPage>;
  private readonly primaryParentIdByPageId = new Map<string, string>();

  constructor(
    options: {
      databaseRecords?: PageGraphDatabase[];
      databaseRows?: PageGraphDatabaseRow[];
      pages: PageGraphPage[];
      placements?: PageGraphPlacement[];
    },
  ) {
    this.pageById = new Map(options.pages.map((item) => [item.id, item]));
    this.indexDatabases(options.databaseRecords ?? []);
    this.indexDatabaseRows(options.databaseRows ?? []);

    this.indexNavigationPlacements(options.placements ?? []);
    this.indexDatabaseRowChildren();
  }

  getAncestorIds(pageId: string) {
    const ids: string[] = [];
    const visited = new Set<string>();
    const pendingIds = [pageId];
    let pendingIndex = 0;

    while (pendingIndex < pendingIds.length) {
      const currentId = pendingIds[pendingIndex++];

      if (!currentId || visited.has(currentId)) {
        continue;
      }

      const current = this.pageById.get(currentId);

      if (!current) {
        continue;
      }

      ids.push(current.id);
      visited.add(current.id);

      for (const parentId of this.accessParentIdsByChildId.get(current.id) ??
        []) {
        pendingIds.push(parentId);
      }
    }

    return ids;
  }

  hasOwnedRootAccess(ancestorIds: string[], userId: string) {
    const ancestorIdSet = new Set(ancestorIds);

    for (const ancestorId of ancestorIds) {
      const ancestor = this.pageById.get(ancestorId);
      let hasAncestorParent = false;

      for (const parentId of
        this.accessParentIdsByChildId.get(ancestorId) ?? []) {
        if (ancestorIdSet.has(parentId)) {
          hasAncestorParent = true;
          break;
        }
      }

      if (ancestor?.createdById === userId && !hasAncestorParent) {
        return true;
      }
    }

    return false;
  }

  getNestedPageIds(rootPageId: string, accessibleIds?: Set<string>) {
    return this.collectNestedPageIds(
      [rootPageId],
      accessibleIds,
      this.childIdsByParentId,
    );
  }

  getPrimaryNestedPageIds(rootPageId: string, accessibleIds?: Set<string>) {
    return this.collectNestedPageIds(
      [rootPageId],
      accessibleIds,
      this.primaryChildIdsByParentId,
    );
  }

  getNestedDatabasePageIds(
    rootDatabaseId: string,
    accessibleIds?: Set<string>,
  ) {
    const rootPageIds =
      this.databaseRowPageIdsByDatabaseId.get(rootDatabaseId) ?? [];

    return this.collectNestedPageIds(
      rootPageIds,
      accessibleIds,
      this.childIdsByParentId,
    );
  }

  getPrimaryNestedDatabasePageIds(
    rootDatabaseId: string,
    accessibleIds?: Set<string>,
  ) {
    const rootPageIds =
      this.databaseRowPageIdsByDatabaseId.get(rootDatabaseId) ?? [];

    return this.collectNestedPageIds(
      rootPageIds,
      accessibleIds,
      this.primaryChildIdsByParentId,
    );
  }

  getDatabaseIdsForPageIds(
    pageIds: Iterable<string>,
    accessibleIds?: Set<string>,
  ) {
    const databaseIds: string[] = [];
    const seenPageIds = new Set<string>();

    for (const pageId of pageIds) {
      if (
        seenPageIds.has(pageId) ||
        (accessibleIds && !accessibleIds.has(pageId))
      ) {
        continue;
      }

      seenPageIds.add(pageId);
      databaseIds.push(...(this.databaseIdsByPageId.get(pageId) ?? []));
    }

    return databaseIds;
  }

  getPagePath(
    record: PageGraphPage & { name: string },
    getTitle: (value: string) => string,
  ) {
    const path: string[] = [];
    const visited = new Set<string>();
    let current: (PageGraphPage & { name?: string }) | undefined = record;

    while (current && !visited.has(current.id)) {
      path.unshift(getTitle(current.name ?? ""));
      visited.add(current.id);

      const parentItemId = this.primaryParentIdByPageId.get(current.id);
      current = parentItemId ? this.pageById.get(parentItemId) : undefined;
    }

    return path.join(" / ");
  }

  getPrimaryParentId(pageId: string) {
    return this.primaryParentIdByPageId.get(pageId) ?? null;
  }

  private collectNestedPageIds(
    rootPageIds: Iterable<string>,
    accessibleIds: Set<string> | undefined,
    childIdsByParentId: Map<string, Set<string>>,
  ) {
    const nestedIds = new Set<string>();
    const pendingIds = [...rootPageIds];
    let pendingIndex = 0;

    while (pendingIndex < pendingIds.length) {
      const pageId = pendingIds[pendingIndex++];

      if (
        !pageId ||
        nestedIds.has(pageId) ||
        (accessibleIds && !accessibleIds.has(pageId))
      ) {
        continue;
      }

      nestedIds.add(pageId);

      for (const childId of childIdsByParentId.get(pageId) ?? []) {
        pendingIds.push(childId);
      }
    }

    return [...nestedIds];
  }

  private indexDatabases(records: PageGraphDatabase[]) {
    for (const record of records) {
      this.databasePageIdByDatabaseId.set(record.id, record.pageId);
      const databaseIds = this.databaseIdsByPageId.get(record.pageId);

      if (databaseIds) {
        databaseIds.push(record.id);
      } else {
        this.databaseIdsByPageId.set(record.pageId, [record.id]);
      }
    }
  }

  private indexDatabaseRows(rows: PageGraphDatabaseRow[]) {
    for (const row of rows) {
      const pageIds = this.databaseRowPageIdsByDatabaseId.get(row.databaseId);

      if (pageIds) {
        pageIds.push(row.pageId);
      } else {
        this.databaseRowPageIdsByDatabaseId.set(row.databaseId, [row.pageId]);
      }
    }
  }

  private indexNavigationPlacements(placements: PageGraphPlacement[]) {
    const databasePageIds = new Set(this.databasePageIdByDatabaseId.values());

    for (const placement of placements) {
      if (placement.parentKind !== "page") continue;

      if (placement.placementKind === "linked") {
        if (placement.itemKind === "page") {
          this.addChild(
            placement.parentId,
            placement.itemId,
            databasePageIds.has(placement.itemId),
          );
        }
        continue;
      }

      if (
        placement.placementKind === "primary" &&
        placement.itemKind === "page"
      ) {
        this.primaryParentIdByPageId.set(placement.itemId, placement.parentId);
        this.addPrimaryChild(placement.parentId, placement.itemId);
      }
    }
  }

  private indexDatabaseRowChildren() {
    for (const [databaseId, rowPageIds] of this
      .databaseRowPageIdsByDatabaseId) {
      const parentItemId = this.databasePageIdByDatabaseId.get(databaseId);

      if (!parentItemId) {
        continue;
      }

      for (const rowPageId of rowPageIds) {
        this.primaryParentIdByPageId.set(rowPageId, parentItemId);
        this.addPrimaryChild(parentItemId, rowPageId);
      }
    }
  }

  private addPrimaryChild(parentItemId: string, childPageId: string) {
    const primaryChildIds =
      this.primaryChildIdsByParentId.get(parentItemId) ?? new Set();

    primaryChildIds.add(childPageId);
    this.primaryChildIdsByParentId.set(parentItemId, primaryChildIds);
    this.addChild(parentItemId, childPageId, true);
  }

  private addChild(
    parentItemId: string,
    childPageId: string,
    inheritsAccess = false,
  ) {
    const childIds = this.childIdsByParentId.get(parentItemId) ?? new Set();

    childIds.add(childPageId);
    this.childIdsByParentId.set(parentItemId, childIds);

    if (!inheritsAccess) {
      return;
    }

    const parentIds =
      this.accessParentIdsByChildId.get(childPageId) ?? new Set();

    parentIds.add(parentItemId);
    this.accessParentIdsByChildId.set(childPageId, parentIds);
  }
}
