import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "./db";
import {
  dataSource,
  database,
  databaseRow,
  page,
  pageItemPlacement,
} from "./db/schema";
import {
  PageGraph,
  type PageGraphDatabase,
} from "./page-graph";

export async function loadWorkspacePageGraph(workspaceId: string) {
  const [pages, databaseRecords, databaseRows, placements] = await Promise.all([
    db
      .select({
        createdById: page.createdById,
        id: page.id,
        teamspaceId: page.teamspaceId,
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
        databaseId: dataSource.parentDatabaseId,
        pageId: databaseRow.pageId,
      })
      .from(databaseRow)
      .innerJoin(dataSource, eq(databaseRow.dataSourceId, dataSource.id))
      .innerJoin(database, eq(dataSource.parentDatabaseId, database.id))
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
