import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { database, databaseRow, page, pageItemPlacement } from "./db/schema";

export type PageGraphPage = {
  createdById?: string | null;
  id: string;
  name?: string;
};

type PageGraphPlacement = {
  itemId: string;
  itemKind: string;
  parentId: string;
  parentKind: string;
  placementKind: string;
};

type PageGraphDatabase = {
  id: string;
  pageId: string;
};

type PageGraphDatabaseRow = {
  databaseId: string;
  pageId: string;
};

export class PageGraph {
  private readonly childIdsByParentId = new Map<string, Set<string>>();
  private readonly accessParentIdsByChildId = new Map<string, Set<string>>();
  private readonly primaryChildIdsByParentId = new Map<string, Set<string>>();
  private readonly databasePageIdByDatabaseId: Map<string, string>;
  private readonly pageById: Map<string, PageGraphPage>;
  private readonly primaryParentIdByPageId = new Map<string, string>();

  constructor(
    private readonly options: {
      databaseRecords?: PageGraphDatabase[];
      databaseRows?: PageGraphDatabaseRow[];
      pages: PageGraphPage[];
      placements?: PageGraphPlacement[];
    },
  ) {
    this.pageById = new Map(options.pages.map((item) => [item.id, item]));
    this.databasePageIdByDatabaseId = new Map(
      (options.databaseRecords ?? []).map((record) => [
        record.id,
        record.pageId,
      ]),
    );

    this.indexNavigationPlacements();
    this.indexDatabaseRowChildren();
  }

  getAncestorIds(pageId: string) {
    const ids: string[] = [];
    const visited = new Set<string>();
    const pendingIds = [pageId];

    while (pendingIds.length > 0) {
      const currentId = pendingIds.shift();

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
      const hasAncestorParent = [
        ...(this.accessParentIdsByChildId.get(ancestorId) ?? []),
      ].some((parentId) => ancestorIdSet.has(parentId));

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
    const rootPageIds = (this.options.databaseRows ?? [])
      .filter((row) => row.databaseId === rootDatabaseId)
      .map((row) => row.pageId);

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
    const rootPageIds = (this.options.databaseRows ?? [])
      .filter((row) => row.databaseId === rootDatabaseId)
      .map((row) => row.pageId);

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
    const pageIdSet = new Set(pageIds);

    return (this.options.databaseRecords ?? [])
      .filter(
        (record) =>
          pageIdSet.has(record.pageId) &&
          (!accessibleIds || accessibleIds.has(record.pageId)),
      )
      .map((record) => record.id);
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

    while (pendingIds.length > 0) {
      const pageId = pendingIds.shift();

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

  private indexNavigationPlacements() {
    const databasePageIds = new Set(this.databasePageIdByDatabaseId.values());

    for (const placement of this.options.placements ?? []) {
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
    for (const row of this.options.databaseRows ?? []) {
      const parentItemId = this.databasePageIdByDatabaseId.get(row.databaseId);

      if (!parentItemId) {
        continue;
      }

      this.addPrimaryChild(parentItemId, row.pageId);
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

export async function loadWorkspacePageGraph(workspaceId: string) {
  const [pages, databaseRecords, databaseRows, placements] = await Promise.all([
    db
      .select({
        createdById: page.createdById,
        id: page.id,
      })
      .from(page)
      .where(and(eq(page.workspaceId, workspaceId), isNull(page.deletedAt))),
    db
      .select({
        id: database.id,
        pageId: database.pageId,
      })
      .from(database)
      .where(
        and(
          eq(database.workspaceId, workspaceId),
          isNull(database.deletedAt),
          isNotNull(database.pageId),
        ),
      ),
    db
      .select({
        databaseId: databaseRow.databaseId,
        pageId: databaseRow.pageId,
      })
      .from(databaseRow)
      .innerJoin(database, eq(databaseRow.databaseId, database.id))
      .where(
        and(
          eq(database.workspaceId, workspaceId),
          isNull(database.deletedAt),
          isNull(databaseRow.deletedAt),
        ),
      ),
    db
      .select({
        itemId: pageItemPlacement.itemId,
        itemKind: pageItemPlacement.itemKind,
        parentId: pageItemPlacement.parentId,
        parentKind: pageItemPlacement.parentKind,
        placementKind: pageItemPlacement.placementKind,
      })
      .from(pageItemPlacement)
      .where(
        and(
          eq(pageItemPlacement.workspaceId, workspaceId),
          isNull(pageItemPlacement.deletedAt),
        ),
      ),
  ]);

  return new PageGraph({
    databaseRecords: databaseRecords.filter(
      (record): record is PageGraphDatabase => Boolean(record.pageId),
    ),
    databaseRows,
    pages,
    placements,
  });
}
