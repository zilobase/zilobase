import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  canAccessDatabaseRecord,
  canAccessPage,
  getEffectiveTeamspaceAccessInWorkspace,
  getMembership,
  hasAccess,
} from "../access";
import type { RuntimeEnv } from "../config";
import { db } from "../db";
import {
  database,
  databaseRow,
  databaseView,
  favorite,
  page,
  pageItemPlacement,
} from "../db/schema";
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
    await tx.insert(databaseView).values({
      id: defaultViewId,
      databaseId,
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

export type MoveDatabaseDestination = {
  id: string;
  kind: "database" | "page";
};

export async function moveDatabaseService(input: {
  databaseId: string;
  destination: MoveDatabaseDestination;
  hostDatabaseId?: string;
  moveViews: boolean;
  userId: string;
}) {
  const source = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const destination = await resolveDatabaseMoveDestination({
    destination: input.destination,
    source,
    userId: input.userId,
  });
  const host =
    input.hostDatabaseId && input.hostDatabaseId !== source.id
      ? await requireDatabaseEditAccess(input.hostDatabaseId, input.userId)
      : null;

  if (host && host.workspaceId !== source.workspaceId) {
    throw new ServiceMutationError(
      "The data source host must be in the same workspace.",
      409,
    );
  }
  const activePlacements = await db
    .select()
    .from(pageItemPlacement)
    .where(
      and(
        eq(pageItemPlacement.workspaceId, source.workspaceId),
        eq(pageItemPlacement.itemKind, "database"),
        eq(pageItemPlacement.itemId, source.id),
        isNull(pageItemPlacement.deletedAt),
      ),
    );
  const currentPrimary = activePlacements.find(
    (placement) => placement.placementKind === "primary",
  );

  if (
    currentPrimary?.parentKind === destination.kind &&
    currentPrimary.parentId === destination.id
  ) {
    throw new ServiceMutationError(
      "The data source is already in that destination.",
      409,
    );
  }

  if (destination.kind === "database") {
    await assertDatabaseMoveDoesNotCreateCycle(
      source.workspaceId,
      source.id,
      destination.id,
    );
  }

  const now = new Date();
  const primaryPlacement = {
    id: crypto.randomUUID(),
    workspaceId: source.workspaceId,
    parentKind: destination.kind,
    parentId: destination.id,
    itemKind: "database" as const,
    itemId: source.id,
    placementKind: "primary" as const,
    position: 0,
  };

  await db.transaction(async (tx) => {
    await tx
      .update(pageItemPlacement)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(pageItemPlacement.workspaceId, source.workspaceId),
          eq(pageItemPlacement.itemKind, "database"),
          eq(pageItemPlacement.itemId, source.id),
          eq(pageItemPlacement.placementKind, "primary"),
          isNull(pageItemPlacement.deletedAt),
        ),
      );

    // A linked instance in the destination is replaced by the new primary one.
    await tx
      .update(pageItemPlacement)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(pageItemPlacement.workspaceId, source.workspaceId),
          eq(pageItemPlacement.parentKind, destination.kind),
          eq(pageItemPlacement.parentId, destination.id),
          eq(pageItemPlacement.itemKind, "database"),
          eq(pageItemPlacement.itemId, source.id),
          eq(pageItemPlacement.placementKind, "linked"),
          isNull(pageItemPlacement.deletedAt),
        ),
      );

    await tx
      .update(database)
      .set({
        pageId: destination.kind === "page" ? destination.id : null,
        teamspaceId: destination.teamspaceId,
        updatedAt: now,
      })
      .where(eq(database.id, source.id));

    if (input.moveViews && host) {
      await tx
        .update(database)
        .set({
          config: removeHostedDataSourceViews(host.config, source.id),
          updatedAt: now,
        })
        .where(eq(database.id, host.id));
    }

    await upsertPageItemPlacement(tx, primaryPlacement);

    if (
      !input.moveViews &&
      currentPrimary &&
      !activePlacements.some(
        (placement) =>
          placement.parentKind === currentPrimary.parentKind &&
          placement.parentId === currentPrimary.parentId &&
          placement.placementKind === "linked",
      )
    ) {
      await upsertPageItemPlacement(tx, {
        workspaceId: source.workspaceId,
        parentKind: currentPrimary.parentKind as "database" | "page",
        parentId: currentPrimary.parentId,
        itemKind: "database",
        itemId: source.id,
        placementKind: "linked",
        position: currentPrimary.position,
      });
    }
  });

  return {
    databaseId: source.id,
    destination: input.destination,
    hostDatabaseId: host?.id ?? null,
    moveViews: input.moveViews,
    pageId: destination.kind === "page" ? destination.id : null,
    teamspaceId: destination.teamspaceId,
  };
}

export function removeHostedDataSourceViews(
  config: unknown,
  sourceDatabaseId: string,
) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return config;
  }

  const record = config as Record<string, unknown>;
  const linkedViews = record.linkedDatabaseViews;

  if (!Array.isArray(linkedViews)) {
    return config;
  }

  const nextLinkedViews = linkedViews.filter((view) => {
    if (!view || typeof view !== "object" || Array.isArray(view)) {
      return true;
    }

    const linkedView = view as Record<string, unknown>;
    return !(
      linkedView.databaseId === sourceDatabaseId &&
      linkedView.sourceKind === "source"
    );
  });

  return nextLinkedViews.length === linkedViews.length
    ? config
    : { ...record, linkedDatabaseViews: nextLinkedViews };
}

async function resolveDatabaseMoveDestination(input: {
  destination: MoveDatabaseDestination;
  source: typeof database.$inferSelect;
  userId: string;
}) {
  if (input.destination.kind === "database") {
    if (input.destination.id === input.source.id) {
      throw new ServiceMutationError(
        "A data source cannot be moved into itself.",
        409,
      );
    }

    const target = await requireDatabaseEditAccess(
      input.destination.id,
      input.userId,
    );

    if (target.workspaceId !== input.source.workspaceId) {
      throw new ServiceMutationError(
        "Data sources cannot be moved between workspaces.",
        409,
      );
    }

    return {
      id: target.id,
      kind: "database" as const,
      teamspaceId: target.teamspaceId,
    };
  }

  const [target] = await db
    .select()
    .from(page)
    .where(
      and(
        eq(page.id, input.destination.id),
        eq(page.workspaceId, input.source.workspaceId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);

  if (!target) {
    throw new ServiceMutationError("Page not found", 404);
  }

  if (!(await canAccessPage(target.id, input.userId, "edit"))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return {
    id: target.id,
    kind: "page" as const,
    teamspaceId: target.teamspaceId,
  };
}

async function assertDatabaseMoveDoesNotCreateCycle(
  workspaceId: string,
  sourceDatabaseId: string,
  destinationDatabaseId: string,
) {
  const placements = await db
    .select({
      itemId: pageItemPlacement.itemId,
      parentId: pageItemPlacement.parentId,
      parentKind: pageItemPlacement.parentKind,
    })
    .from(pageItemPlacement)
    .where(
      and(
        eq(pageItemPlacement.workspaceId, workspaceId),
        eq(pageItemPlacement.itemKind, "database"),
        eq(pageItemPlacement.placementKind, "primary"),
        isNull(pageItemPlacement.deletedAt),
      ),
    );
  const parentDatabaseByDatabaseId = new Map(
    placements.flatMap((placement) =>
      placement.parentKind === "database"
        ? [[placement.itemId, placement.parentId] as const]
        : [],
    ),
  );
  const visited = new Set<string>();
  let currentId: string | undefined = destinationDatabaseId;

  while (currentId && !visited.has(currentId)) {
    if (currentId === sourceDatabaseId) {
      throw new ServiceMutationError(
        "Moving the data source there would create a cycle.",
        409,
      );
    }

    visited.add(currentId);
    currentId = parentDatabaseByDatabaseId.get(currentId);
  }
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
            inArray(databaseRow.databaseId, restoredDatabaseIds),
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
