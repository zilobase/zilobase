import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import { type AfterCommit } from "../../../infrastructure/database/after-commit";
import { dataSource, database, databaseRow, page } from "../../../infrastructure/database/schema";
import { loadWorkspacePageGraph } from "../graph/loader";
import type { RuntimeEnv } from "../../../shared/config/config";

type SoftDeleteResult = {
  deletedAt: Date;
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};

function collectNestedDatabaseTree(
  graph: Awaited<ReturnType<typeof loadWorkspacePageGraph>>,
  databaseRecords: Array<{ id: string; pageId: string }>,
  initialPageIds: Iterable<string>,
  initialDatabaseIds: Iterable<string> = [],
) {
  const pageIds = new Set(initialPageIds);
  const databaseIds = new Set(initialDatabaseIds);
  let changed = true;

  while (changed) {
    changed = false;

    for (const record of databaseRecords) {
      if (databaseIds.has(record.id) || !pageIds.has(record.pageId)) {
        continue;
      }

      databaseIds.add(record.id);
      changed = true;

      for (const pageId of graph.getPrimaryNestedDatabasePageIds(record.id)) {
        if (!pageIds.has(pageId)) {
          pageIds.add(pageId);
          changed = true;
        }
      }
    }
  }

  return { databaseIds, pageIds };
}

async function softDeleteRecords({
  afterCommit,
  databaseIds,
  userId,
  pageIds,
  workspaceId,
  env,
}: {
  afterCommit?: AfterCommit;
  databaseIds: string[];
  env?: RuntimeEnv;
  userId: string;
  pageIds: string[];
  workspaceId: string;
}) {
  const now = new Date();

  await db.transaction(async (tx) => {
    if (pageIds.length > 0) {
      await tx
        .update(page)
        .set({
          deletedAt: now,
          deletedById: userId,
          updatedAt: now,
        })
        .where(and(inArray(page.id, pageIds), isNull(page.deletedAt)));
    }

    if (databaseIds.length > 0) {
      await tx
        .update(database)
        .set({
          deletedAt: now,
          deletedById: userId,
          updatedAt: now,
        })
        .where(and(inArray(database.id, databaseIds), isNull(database.deletedAt)));

      await tx
        .update(databaseRow)
        .set({
          deletedAt: now,
          deletedById: userId,
          updatedAt: now,
        })
        .where(
          and(
            inArray(
              databaseRow.dataSourceId,
              tx
                .select({ id: dataSource.id })
                .from(dataSource)
                .where(inArray(dataSource.parentDatabaseId, databaseIds)),
            ),
            isNull(databaseRow.deletedAt),
          ),
        );
    }
  });

  return now;
}

export async function softDeletePageTree({
  workspaceId,
  rootPageId,
  userId,
  env,
}: {
  env?: RuntimeEnv;
  workspaceId: string;
  rootPageId: string;
  userId: string;
}): Promise<SoftDeleteResult> {
  const graph = await loadWorkspacePageGraph(workspaceId);
  const databaseRecords = await db
    .select({
      id: database.id,
      pageId: database.pageId,
    })
    .from(database)
    .where(and(eq(database.workspaceId, workspaceId), isNull(database.deletedAt)));

  const { databaseIds, pageIds } = collectNestedDatabaseTree(
    graph,
    databaseRecords.filter((record): record is typeof record & { pageId: string } =>
      Boolean(record.pageId),
    ),
    graph.getPrimaryNestedPageIds(rootPageId),
  );

  const deletedPageIds = [...pageIds];
  const deletedDatabaseIds = [...databaseIds];

  const deletedAt = await softDeleteRecords({
    databaseIds: deletedDatabaseIds,
    userId,
    pageIds: deletedPageIds,
    workspaceId,
    env,
  });

  return { deletedAt, deletedDatabaseIds, deletedPageIds };
}

export async function softDeleteDatabaseTree({
  afterCommit,
  databaseId,
  workspaceId,
  userId,
  env,
}: {
  afterCommit?: AfterCommit;
  databaseId: string;
  env?: RuntimeEnv;
  workspaceId: string;
  userId: string;
}): Promise<SoftDeleteResult> {
  const graph = await loadWorkspacePageGraph(workspaceId);
  const databaseRecords = await db
    .select({
      id: database.id,
      pageId: database.pageId,
    })
    .from(database)
    .where(and(eq(database.workspaceId, workspaceId), isNull(database.deletedAt)));
  const { databaseIds, pageIds } = collectNestedDatabaseTree(
    graph,
    databaseRecords.filter((record): record is typeof record & { pageId: string } =>
      Boolean(record.pageId),
    ),
    graph.getPrimaryNestedDatabasePageIds(databaseId),
    [databaseId],
  );
  const deletedPageIds = [...pageIds];
  const deletedDatabaseIds = [...databaseIds];

  const deletedAt = await softDeleteRecords({
    afterCommit,
    databaseIds: deletedDatabaseIds,
    userId,
    pageIds: deletedPageIds,
    workspaceId,
    env,
  });

  return { deletedAt, deletedDatabaseIds, deletedPageIds };
}
