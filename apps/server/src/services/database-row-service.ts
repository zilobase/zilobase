import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";

import { canAccessPage } from "../access";
import { encodePageContentAsYjs } from "../collaboration/service";
import type { RuntimeEnv } from "../config";
import { db } from "../db";
import {
  databaseProperty,
  databaseRow,
  favorite,
  page,
  pageCollaborationDocument,
  pageProperty,
  pagePropertyValue,
} from "../db/schema";
import { upsertPageItemPlacement } from "../page-item-placements";
import {
  requireDatabaseAccess,
  requireDatabaseEditAccess,
} from "./database-access";
import {
  commitDatabaseMutation,
  commitDatabaseMutationBatch,
  type DatabaseMutationCommitResult,
} from "./database-commit";
import { fetchDatabaseRowDelta } from "./database-delta";
import { isDatabaseHostPageId } from "./database-host-page";
import { getStatusDefaultValue } from "./database-property-config";
import {
  incrementDatabaseRowPlacementPositions,
  updateDatabaseRowPlacementPositions,
  updateDatabaseRowPositions,
} from "./database-position-service";
import { inheritDatabaseRowProperties } from "./database-row-import-service";
import { ServiceMutationError } from "./mutation-error";

export async function createDatabaseRowService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  pageId?: string | null;
  parentRowId?: string | null;
  position?: number;
  sourceDatabaseId?: string | null;
  sourcePropertyMode?: "duplicate" | "match";
  sourceRowId?: string | null;
  title?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  let sourceDatabase: Awaited<ReturnType<typeof requireDatabaseAccess>> | null =
    null;

  if (input.sourceDatabaseId && input.sourceDatabaseId !== existing.id) {
    try {
      sourceDatabase = await requireDatabaseAccess(
        input.sourceDatabaseId,
        input.userId,
        input.sourceRowId ? "edit" : "view",
      );
    } catch (error) {
      if (error instanceof ServiceMutationError && error.status === 404) {
        throw new ServiceMutationError("Source database not found", 404);
      }

      throw error;
    }

    if (sourceDatabase.workspaceId !== existing.workspaceId) {
      throw new ServiceMutationError("Source database not found", 404);
    }
  }

  if (input.sourceRowId && !sourceDatabase) {
    throw new ServiceMutationError("Source database not found", 404);
  }

  if (sourceDatabase && !input.sourceRowId) {
    throw new ServiceMutationError("A source row is required for a move", 400);
  }

  if (isDatabaseHostPageId(input.pageId, existing.pageId)) {
    throw new ServiceMutationError(
      "A page cannot be nested inside itself",
      400,
    );
  }

  const rows = await db
    .select({
      id: databaseRow.id,
      pageId: databaseRow.pageId,
      position: databaseRow.position,
    })
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.databaseId, existing.id),
        isNull(databaseRow.deletedAt),
      ),
    )
    .orderBy(asc(databaseRow.position));

  const sourceRows =
    sourceDatabase && input.sourceRowId
      ? await db
          .select({
            id: databaseRow.id,
            pageId: databaseRow.pageId,
            parentRowId: databaseRow.parentRowId,
            position: databaseRow.position,
          })
          .from(databaseRow)
          .where(
            and(
              eq(databaseRow.databaseId, sourceDatabase.id),
              isNull(databaseRow.deletedAt),
            ),
          )
          .orderBy(asc(databaseRow.position))
      : [];
  const sourceRow = sourceRows.find((row) => row.id === input.sourceRowId);

  if (
    input.sourceRowId &&
    (!sourceRow || (input.pageId && sourceRow.pageId !== input.pageId))
  ) {
    throw new ServiceMutationError("Source row not found", 404);
  }

  const targetPosition =
    input.position === undefined
      ? rows.length
      : Math.min(input.position, rows.length);

  let pageId =
    typeof input.pageId === "string" && input.pageId.length > 0
      ? input.pageId
      : crypto.randomUUID();
  let title = input.title;
  let pageMetadata: Record<string, unknown> = {};

  if (input.pageId) {
    const [pageRecord] = await db
      .select({
        id: page.id,
        metadata: page.metadata,
        hasContent: page.hasContent,
        name: page.name,
        workspaceId: page.workspaceId,
      })
      .from(page)
      .where(
        and(
          eq(page.id, input.pageId),
          eq(page.workspaceId, existing.workspaceId),
          isNull(page.deletedAt),
        ),
      )
      .limit(1);

    if (!pageRecord) {
      throw new ServiceMutationError("Page not found", 404);
    }

    if (!(await canAccessPage(pageRecord.id, input.userId, "edit"))) {
      throw new ServiceMutationError("Forbidden", 403);
    }

    if (title === undefined) {
      title = pageRecord.name.trim() || "Untitled";
    }

    if (
      pageRecord.metadata &&
      typeof pageRecord.metadata === "object" &&
      !Array.isArray(pageRecord.metadata)
    ) {
      pageMetadata = pageRecord.metadata as Record<string, unknown>;
    }
  } else {
    title = title ?? "Untitled";
  }

  if (rows.some((row) => row.pageId === pageId)) {
    throw new ServiceMutationError(
      "This page is already in this database",
      409,
    );
  }

  const statusProperties = await db
    .select({ config: pageProperty.config, id: pageProperty.id })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.databaseId, existing.id),
        eq(pageProperty.type, "status"),
        isNull(pageProperty.deletedAt),
      ),
    );

  const defaultStatusValues = statusProperties
    .map((property) => ({
      propertyId: property.id,
      value: getStatusDefaultValue(property.config),
    }))
    .filter(
      (property): property is { propertyId: string; value: string } =>
        typeof property.value === "string" && property.value.length > 0,
    );

  const [databaseFavorite] = await db
    .select({ id: favorite.id })
    .from(favorite)
    .where(
      and(
        eq(favorite.userId, input.userId),
        eq(favorite.databaseId, existing.id),
      ),
    )
    .limit(1);
  const shouldInheritFavorite = Boolean(databaseFavorite);

  const rowId = crypto.randomUUID();
  let createdAt = "";

  const targetChanged = sourceDatabase
    ? (["rows", "properties", "values"] as const)
    : defaultStatusValues.length > 0
      ? (["rows", "values"] as const)
      : (["rows"] as const);
  const createTargetRow = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => {
    const now = new Date();
    createdAt = now.toISOString();
    const inherited = sourceDatabase
      ? await inheritDatabaseRowProperties(
          {
            now,
            pageId,
            sourceDatabaseId: sourceDatabase.id,
            sourcePropertyMode: input.sourcePropertyMode ?? "match",
            targetDatabaseId: existing.id,
            workspaceId: existing.workspaceId,
          },
          tx,
        )
      : { properties: [], values: [] };

    if (input.pageId) {
      await tx
        .update(page)
        .set({
          metadata: pageMetadata,
          updatedAt: now,
        })
        .where(eq(page.id, pageId));
    } else {
      await tx.insert(page).values({
        id: pageId,
        workspaceId: existing.workspaceId,
        createdById: input.userId,
        type: "pageblock",
        name: title as string,
        url: "#",
        content: null,
        hasContent: false,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(pageCollaborationDocument).values({
        pageId,
        state: Buffer.from(encodePageContentAsYjs(null)),
        updatedAt: now,
      });
    }

    await tx
      .update(databaseRow)
      .set({
        position: sql`${databaseRow.position} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(databaseRow.databaseId, existing.id),
          isNull(databaseRow.deletedAt),
          gte(databaseRow.position, targetPosition),
        ),
      );
    await incrementDatabaseRowPlacementPositions(
      tx,
      existing.id,
      targetPosition,
      now,
    );

    await tx.insert(databaseRow).values({
      id: rowId,
      databaseId: existing.id,
      pageId,
      parentRowId: input.parentRowId ?? null,
      position: targetPosition,
      createdById: input.userId,
      lastEditedById: input.userId,
      createdAt: now,
      updatedAt: now,
    });
    await upsertPageItemPlacement(tx, {
      workspaceId: existing.workspaceId,
      parentKind: "database",
      parentId: existing.id,
      itemKind: "page",
      itemId: pageId,
      placementKind: "database_row",
      sourceRowId: rowId,
      position: targetPosition,
    });

    const inheritedValuePropertyIds = new Set(
      inherited.values
        .filter((value) => value.pageId === pageId)
        .map((value) => value.propertyId),
    );
    const insertedValues = defaultStatusValues
      .filter((property) => !inheritedValuePropertyIds.has(property.propertyId))
      .map((property) => ({
        createdAt: now.toISOString(),
        id: crypto.randomUUID(),
        propertyId: property.propertyId,
        updatedAt: now.toISOString(),
        value: property.value,
        pageId,
      }));

    if (insertedValues.length > 0) {
      await tx.insert(pagePropertyValue).values(
        insertedValues.map((propertyValue) => ({
          id: propertyValue.id,
          propertyId: propertyValue.propertyId,
          value: propertyValue.value,
          pageId: propertyValue.pageId,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    if (shouldInheritFavorite) {
      await tx
        .insert(favorite)
        .values({
          id: crypto.randomUUID(),
          pageId,
          userId: input.userId,
        })
        .onConflictDoNothing({
          target: [favorite.userId, favorite.pageId],
        });
    }

    const delta = await fetchDatabaseRowDelta(rowId, tx);
    const shiftedRows = rows
      .filter((row) => row.position >= targetPosition)
      .map((row) => ({
        id: row.id,
        position: row.position + 1,
        updatedAt: now.toISOString(),
      }));

    return {
      delta: {
        ...(sourceDatabase ? { properties: inherited.properties } : {}),
        rows: [...shiftedRows, ...(delta?.rows ?? [])],
        ...(insertedValues.length > 0 || inherited.values.length > 0
          ? { values: [...insertedValues, ...inherited.values] }
          : {}),
      },
    };
  };

  let commit: DatabaseMutationCommitResult;
  let sourceCommit: DatabaseMutationCommitResult | undefined;

  if (sourceDatabase && sourceRow && input.sourceRowId) {
    const sourceDatabaseId = sourceDatabase.id;
    const sourceRowId = input.sourceRowId;
    const batch = await commitDatabaseMutationBatch(
      { actorId: input.userId, env: input.env },
      async (tx) => {
        const targetResult = await createTargetRow(tx);
        const now = new Date();
        const remainingSourceRows = sourceRows.filter(
          (row) => row.id !== sourceRowId,
        );

        await tx
          .delete(databaseRow)
          .where(
            and(
              eq(databaseRow.id, sourceRowId),
              eq(databaseRow.databaseId, sourceDatabaseId),
            ),
          );

        await tx
          .update(databaseRow)
          .set({ parentRowId: null, updatedAt: now })
          .where(
            and(
              eq(databaseRow.databaseId, sourceDatabaseId),
              eq(databaseRow.parentRowId, sourceRowId),
              isNull(databaseRow.deletedAt),
            ),
          );

        const remainingSourceRowIds = remainingSourceRows.map((row) => row.id);
        await updateDatabaseRowPositions(
          tx,
          sourceDatabaseId,
          remainingSourceRowIds,
          now,
        );
        await updateDatabaseRowPlacementPositions(
          tx,
          sourceDatabaseId,
          remainingSourceRowIds,
          now,
        );

        return {
          mutations: [
            {
              changed: [...targetChanged],
              databaseId: existing.id,
              delta: targetResult.delta,
            },
            {
              changed: ["rows"],
              databaseId: sourceDatabaseId,
              delta: {
                removedRowIds: [sourceRowId],
                rows: remainingSourceRows.map((row, position) => ({
                  id: row.id,
                  ...(row.parentRowId === sourceRowId
                    ? { parentRowId: null }
                    : {}),
                  position,
                  updatedAt: now.toISOString(),
                })),
              },
            },
          ],
          result: undefined,
        };
      },
    );
    commit = batch.commits.find(
      (candidate) => candidate.databaseId === existing.id,
    )!;
    sourceCommit = batch.commits.find(
      (candidate) => candidate.databaseId === sourceDatabaseId,
    );
  } else {
    commit = await commitDatabaseMutation(
      {
        actorId: input.userId,
        changed: [...targetChanged],
        databaseId: existing.id,
        env: input.env,
      },
      createTargetRow,
    );
  }

  return {
    commit,
    ...(sourceCommit ? { sourceCommit } : {}),
    createdAt,
    isFavorite: shouldInheritFavorite,
    parentRowId: input.parentRowId ?? null,
    position: targetPosition,
    databaseId: existing.id,
    rowId,
    rowPageId: pageId,
    title: title as string,
    updatedAt: createdAt,
  };
}
