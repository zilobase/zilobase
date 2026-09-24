import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { page, database, databaseRow, dataSource } from "../../infrastructure/database/schema";

export async function getPageRecord(id: string) {
  const [record] = await db
    .select()
    .from(page)
    .where(and(eq(page.id, id), isNull(page.deletedAt)))
    .limit(1);

  return record ?? null;
}

export async function loadStandaloneDatabaseForPage(pageId: string, workspaceId: string) {
  const [record] = await db
    .select({ databaseId: dataSource.parentDatabaseId })
    .from(databaseRow)
    .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
    .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
    .where(
      and(
        eq(databaseRow.pageId, pageId),
        eq(database.workspaceId, workspaceId),
        isNull(database.pageId),
        isNull(database.deletedAt),
        isNull(databaseRow.deletedAt),
      ),
    )
    .limit(1);
  return record;
}

export async function loadActivePageInWorkspace(pageId: string, workspaceId: string) {
  const [record] = await db
    .select({ id: page.id })
    .from(page)
    .where(and(eq(page.id, pageId), eq(page.workspaceId, workspaceId), isNull(page.deletedAt)))
    .limit(1);
  return record;
}

export async function loadActiveDatabaseContainer(databaseId: string, workspaceId: string) {
  const [record] = await db
    .select({ pageId: database.pageId })
    .from(database)
    .where(
      and(
        eq(database.id, databaseId),
        eq(database.workspaceId, workspaceId),
        isNull(database.deletedAt),
      ),
    )
    .limit(1);
  return record;
}
