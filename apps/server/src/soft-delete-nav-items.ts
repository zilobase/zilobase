import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "./db";
import { database, databaseRow, page } from "./db/schema";
import { loadWorkspacePageGraph } from "./page-graph";

type SoftDeleteResult = {
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
  databaseIds,
  userId,
  pageIds,
}: {
  databaseIds: string[];
  userId: string;
  pageIds: string[];
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
        .where(
          and(inArray(database.id, databaseIds), isNull(database.deletedAt)),
        );

      await tx
        .update(databaseRow)
        .set({
          deletedAt: now,
          deletedById: userId,
          updatedAt: now,
        })
        .where(
          and(
            inArray(databaseRow.databaseId, databaseIds),
            isNull(databaseRow.deletedAt),
          ),
        );
    }
  });
}

export async function softDeletePageTree({
  workspaceId,
  rootPageId,
  userId,
}: {
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
    .where(
      and(eq(database.workspaceId, workspaceId), isNull(database.deletedAt)),
    );

  const { databaseIds, pageIds } = collectNestedDatabaseTree(
    graph,
    databaseRecords.filter(
      (record): record is typeof record & { pageId: string } =>
        Boolean(record.pageId),
    ),
    graph.getPrimaryNestedPageIds(rootPageId),
  );

  const deletedPageIds = [...pageIds];
  const deletedDatabaseIds = [...databaseIds];

  await softDeleteRecords({
    databaseIds: deletedDatabaseIds,
    userId,
    pageIds: deletedPageIds,
  });

  return { deletedDatabaseIds, deletedPageIds };
}

export async function softDeleteDatabaseTree({
  databaseId,
  workspaceId,
  userId,
}: {
  databaseId: string;
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
    .where(
      and(eq(database.workspaceId, workspaceId), isNull(database.deletedAt)),
    );
  const { databaseIds, pageIds } = collectNestedDatabaseTree(
    graph,
    databaseRecords.filter(
      (record): record is typeof record & { pageId: string } =>
        Boolean(record.pageId),
    ),
    graph.getPrimaryNestedDatabasePageIds(databaseId),
    [databaseId],
  );
  const deletedPageIds = [...pageIds];
  const deletedDatabaseIds = [...databaseIds];

  await softDeleteRecords({
    databaseIds: deletedDatabaseIds,
    userId,
    pageIds: deletedPageIds,
  });

  return { deletedDatabaseIds, deletedPageIds };
}
