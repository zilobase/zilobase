import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  canAccessDatabaseRecord,
  canAccessPage,
  getEffectiveTeamspaceAccessInWorkspace,
  getMembership,
  hasAccess,
} from "../../access";
import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  database,
  databaseDataSource,
  databaseRow,
  databaseView,
  dataSource,
  favorite,
  page,
  pageItemPlacement,
} from "../../../infrastructure/database/schema";
import { upsertPageItemPlacement } from "../../pages/placements";
import { softDeleteDatabaseTree } from "../../pages/mutations/soft-delete-nav-items";
import { invalidateDatabaseAutomationDependencies } from "../automations/service";
import { getDatabaseRecord } from "../access/database-access";
import { getDatabaseExportPayload } from "./payload";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import {
  enqueueNavigationInvalidation,
  publishCommittedNavigationInvalidation,
} from "../../workspaces/navigation-realtime/outbox";

async function resolveCreationTeamspace(
  input: Parameters<typeof createDatabaseService>[0],
  standalone: boolean,
) {
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

  return teamspaceId;
}

export async function createDatabaseService(input: {
  config?: Record<string, unknown>;
  defaultViewIcon?: string;
  icon?: string;
  name?: string;
  workspaceId: string;
  pageId?: string;
  standalone?: boolean;
  teamspaceId?: string | null;
  userId: string;
  env?: RuntimeEnv;
  newDatabaseId?: string;
  newDataSourceId?: string;
  newDefaultViewId?: string;
}) {
  const name = input.name?.trim() || "New database";
  const standalone = input.standalone === true;

  const teamspaceId = await resolveCreationTeamspace(input, standalone);

  const databaseId = input.newDatabaseId ?? crypto.randomUUID();
  const dataSourceId = input.newDataSourceId ?? crypto.randomUUID();
  const defaultViewId = input.newDefaultViewId ?? crypto.randomUUID();
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

  const navigationEvent = await db.transaction(async (tx) => {
    await tx.insert(database).values({
      id: databaseId,
      workspaceId: input.workspaceId,
      createdById: input.userId,
      pageId: standalone ? null : input.pageId,
      ...(teamspaceId ? { teamspaceId } : {}),
      name,
      config: {
        ...(input.config ?? {}),
        ...(input.icon ? { emoji: input.icon } : {}),
      },
    });
    await tx.insert(dataSource).values({
      id: dataSourceId,
      workspaceId: input.workspaceId,
      parentDatabaseId: databaseId,
      createdById: input.userId,
      name,
      config: {
        ...(input.config ?? {}),
        ...(input.icon ? { emoji: input.icon } : {}),
      },
    });
    await tx.insert(databaseDataSource).values({
      databaseId,
      dataSourceId,
      linkedById: input.userId,
      position: 0,
    });
    await tx.insert(databaseView).values({
      ...(input.defaultViewIcon
        ? { config: { icon: input.defaultViewIcon } }
        : {}),
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
    return enqueueNavigationInvalidation(tx, input.workspaceId);
  });
  await publishCommittedNavigationInvalidation(navigationEvent, input.env);

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

export async function deleteDatabaseService(input: {
  databaseId: string;
  env?: RuntimeEnv;
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
    env: input.env,
    workspaceId: existing.workspaceId,
    userId: input.userId,
  });
  for (const databaseId of deleted.deletedDatabaseIds) {
    await invalidateDatabaseAutomationDependencies({
      dependencyId: databaseId,
      dependencyType: "database",
      reason: "The source database used by this automation was deleted",
    });
  }

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
  env?: RuntimeEnv;
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
    const payload = await getDatabaseExportPayload(
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
  const { navigationEvent, ...restored } = await db.transaction(async (tx) => {
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
      navigationEvent: await enqueueNavigationInvalidation(
        tx,
        existing.workspaceId,
        { committedAt: now },
      ),
      restoredDatabaseIds,
      restoredPageIds: restoredPages.map((record) => record.id),
    };
  });
  await publishCommittedNavigationInvalidation(navigationEvent, input.env);

  const restoredRecord = {
    ...existing,
    deletedAt: null,
    deletedById: null,
    updatedAt: now,
  };
  const payload = await getDatabaseExportPayload(
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
