import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  canAccessDatabaseRecord,
  canAccessPage,
  getEffectiveTeamspaceAccessInWorkspace,
  getMembership,
  hasAccess,
} from "../features/access";
import type { RuntimeEnv } from "../shared/config/config";
import { db } from "../infrastructure/database";
import {
  database,
  databaseDataSource,
  databaseRow,
  databaseView,
  dataSource,
  favorite,
  page,
  pageItemPlacement,
} from "../infrastructure/database/schema";
import { upsertPageItemPlacement } from "../page-item-placements";
import { softDeleteDatabaseTree } from "../soft-delete-nav-items";
import {
  getDatabaseRecord,
  requireDatabaseEditAccess,
} from "./database-access";
import { commitDatabaseMutation } from "./database-commit";
import type { DatabaseDelta } from "./database-delta";
import { getDatabasePayload } from "./database-payload";
import { ServiceMutationError } from "./mutation-error";

export async function createDatabaseService(input: {
  name?: string;
  workspaceId: string;
  pageId?: string;
  standalone?: boolean;
  teamspaceId?: string | null;
  userId: string;
}) {
  const name = input.name?.trim() || "New database";
  const standalone = input.standalone === true;

  const [pageRecord] =
    !standalone && input.pageId
      ? await db
          .select({ id: page.id, teamspaceId: page.teamspaceId })
          .from(page)
          .where(
            and(
              eq(page.id, input.pageId),
              eq(page.workspaceId, input.workspaceId),
              isNull(page.deletedAt),
            ),
          )
          .limit(1)
      : [];

  if (!standalone && !pageRecord) {
    throw new ServiceMutationError("Page not found", 404);
  }

  if (
    pageRecord &&
    input.teamspaceId !== undefined &&
    input.teamspaceId !== pageRecord.teamspaceId
  ) {
    throw new ServiceMutationError(
      "A database must use its parent page teamspace.",
      409,
    );
  }
  const teamspaceId = pageRecord?.teamspaceId ?? input.teamspaceId ?? null;

  if (standalone && teamspaceId) {
    if (
      !hasAccess(
        await getEffectiveTeamspaceAccessInWorkspace(
          teamspaceId,
          input.workspaceId,
          input.userId,
        ),
        "edit",
      )
    ) {
      throw new ServiceMutationError("Forbidden", 403);
    }
  } else if (standalone) {
    if (!(await getMembership(input.workspaceId, input.userId))) {
      throw new ServiceMutationError("Forbidden", 403);
    }
  } else if (
    !pageRecord ||
    !(await canAccessPage(pageRecord.id, input.userId, "edit"))
  ) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const databaseId = crypto.randomUUID();
  const dataSourceId = crypto.randomUUID();
  const defaultViewId = crypto.randomUUID();
  const parentPlacementId = standalone ? null : crypto.randomUUID();
  const [parentFavorite] =
    !standalone && input.pageId
      ? await db
          .select({ id: favorite.id })
          .from(favorite)
          .where(
            and(
              eq(favorite.userId, input.userId),
              eq(favorite.pageId, input.pageId),
            ),
          )
          .limit(1)
      : [];

  await db.transaction(async (tx) => {
    await tx.insert(database).values({
      id: databaseId,
      workspaceId: input.workspaceId,
      createdById: input.userId,
      pageId: standalone ? null : input.pageId,
      ...(teamspaceId ? { teamspaceId } : {}),
      name,
      config: {},
    });
    await tx.insert(dataSource).values({
      id: dataSourceId,
      workspaceId: input.workspaceId,
      parentDatabaseId: databaseId,
      createdById: input.userId,
      name,
      config: {},
    });
    await tx.insert(databaseDataSource).values({
      databaseId,
      dataSourceId,
      linkedById: input.userId,
      position: 0,
    });
    await tx.insert(databaseView).values({
      id: defaultViewId,
      databaseId,
      dataSourceId,
      type: "table",
      name: "Table",
      position: 0,
    });
    if (parentPlacementId && input.pageId) {
      await upsertPageItemPlacement(tx, {
        id: parentPlacementId,
        workspaceId: input.workspaceId,
        parentKind: "page",
        parentId: input.pageId,
        itemKind: "database",
        itemId: databaseId,
        placementKind: "primary",
      });
    }

    if (parentFavorite) {
      await tx
        .insert(favorite)
        .values({
          databaseId,
          id: crypto.randomUUID(),
          userId: input.userId,
        })
        .onConflictDoNothing({
          target: [favorite.userId, favorite.databaseId],
        });
    }
  });

  return {
    databaseId,
    dataSourceId,
    defaultViewId,
    name,
    pageId: standalone ? null : input.pageId,
    parentPlacement:
      parentPlacementId && input.pageId
        ? {
            id: parentPlacementId,
            workspaceId: input.workspaceId,
            parentKind: "page" as const,
            parentId: input.pageId,
            itemKind: "database" as const,
            itemId: databaseId,
            placementKind: "primary" as const,
            sourceRowId: null,
            position: 0,
          }
        : null,
  };
}

export async function updateDatabaseService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const values: Partial<typeof database.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    values.name = input.name;
  }

  if (input.config !== undefined) {
    values.config = input.config;
  }

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["database"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx.update(database).set(values).where(eq(database.id, existing.id));

      return {
        delta: {
          database: {
            id: existing.id,
            ...values,
          },
        } satisfies DatabaseDelta,
      };
    },
  );

  return { commit, databaseId: existing.id };
}

export async function deleteDatabaseService(input: {
  databaseId: string;
  userId: string;
}) {
  const existing = await getDatabaseRecord(input.databaseId);

  if (!existing) {
    throw new ServiceMutationError("Database not found", 404);
  }

  if (!(await canAccessDatabaseRecord(existing, input.userId, "full"))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const deleted = await softDeleteDatabaseTree({
    databaseId: existing.id,
    workspaceId: existing.workspaceId,
    userId: input.userId,
  });

  return {
    database: {
      ...existing,
      deletedAt: deleted.deletedAt,
      deletedById: input.userId,
      updatedAt: deleted.deletedAt,
    },
    deletedDatabaseIds: deleted.deletedDatabaseIds,
    deletedPageIds: deleted.deletedPageIds,
  };
}

export async function restoreDatabaseService(input: {
  databaseId: string;
  userId: string;
}) {
  const existing = await getDatabaseRecord(input.databaseId, {
    includeDeleted: true,
  });

  if (!existing) {
    throw new ServiceMutationError("Database not found", 404);
  }

  if (!(await getMembership(existing.workspaceId, input.userId))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  if (!existing.deletedAt) {
    const payload = await getDatabasePayload(
      existing.id,
      input.userId,
      existing,
      { includeDeleted: true },
    );

    return {
      database: payload?.database ?? existing,
      restoredDatabaseIds: [],
      restoredPageIds: [],
    };
  }

  const deletedAt = existing.deletedAt;
  const now = new Date();
  const restored = await db.transaction(async (tx) => {
    const restoredDatabases = await tx
      .update(database)
      .set({
        deletedAt: null,
        deletedById: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(database.workspaceId, existing.workspaceId),
          eq(database.deletedAt, deletedAt),
          existing.deletedById
            ? eq(database.deletedById, existing.deletedById)
            : undefined,
        ),
      )
      .returning({ id: database.id });
    const restoredDatabaseIds = restoredDatabases.map((record) => record.id);

    if (restoredDatabaseIds.length > 0) {
      await tx
        .update(databaseRow)
        .set({
          deletedAt: null,
          deletedById: null,
          updatedAt: now,
        })
        .where(
          and(
            inArray(
              databaseRow.dataSourceId,
              tx
                .select({ id: dataSource.id })
                .from(dataSource)
                .where(
                  inArray(dataSource.parentDatabaseId, restoredDatabaseIds),
                ),
            ),
            eq(databaseRow.deletedAt, deletedAt),
            existing.deletedById
              ? eq(databaseRow.deletedById, existing.deletedById)
              : undefined,
          ),
        );
    }

    const restoredPages = await tx
      .update(page)
      .set({
        deletedAt: null,
        deletedById: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(page.workspaceId, existing.workspaceId),
          eq(page.deletedAt, deletedAt),
          existing.deletedById
            ? eq(page.deletedById, existing.deletedById)
            : undefined,
        ),
      )
      .returning({ id: page.id });

    return {
      restoredDatabaseIds,
      restoredPageIds: restoredPages.map((record) => record.id),
    };
  });

  const restoredRecord = {
    ...existing,
    deletedAt: null,
    deletedById: null,
    updatedAt: now,
  };
  const payload = await getDatabasePayload(
    existing.id,
    input.userId,
    restoredRecord,
    { includeDeleted: true },
  );

  if (!payload) {
    throw new ServiceMutationError("Database not found", 404);
  }

  return { database: payload.database, ...restored };
}
