import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";

import { canAccessPage } from "../features/access";
import { encodePageContentAsYjs } from "../collaboration/service";
import type { RuntimeEnv } from "../shared/config/config";
import { db } from "../infrastructure/database";
import {
  databaseProperty,
  databaseRow,
  favorite,
  page,
  pageCollaborationDocument,
  pageProperty,
  pagePropertyValue,
} from "../infrastructure/database/schema";
import { upsertPageItemPlacement } from "../page-item-placements";
import {
  requireDataSourceAccess,
  requireDataSourceEditAccess,
} from "./data-source-access";
import {
  commitDataSourceMutation,
  commitDataSourceMutationBatch,
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
  sourceDataSourceId?: string | null;
  sourcePropertyMode?: "duplicate" | "match";
  sourceRowId?: string | null;
  title?: string;
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );
  let sourceDataSource: Awaited<ReturnType<typeof requireDataSourceAccess>> | null =
    null;

  if (input.sourceDataSourceId && input.sourceDataSourceId !== existing.id) {
    try {
      sourceDataSource = await requireDataSourceAccess(
        input.sourceDataSourceId,
        input.userId,
        input.sourceRowId ? "edit" : "view",
      );
    } catch (error) {
      if (error instanceof ServiceMutationError && error.status === 404) {
        throw new ServiceMutationError("Data source not found", 404);
      }

      throw error;
    }

    if (sourceDataSource.workspaceId !== existing.workspaceId) {
      throw new ServiceMutationError("Data source not found", 404);
    }
  }

  if (input.sourceRowId && !sourceDataSource) {
    throw new ServiceMutationError("Data source not found", 404);
  }

  if (sourceDataSource && !input.sourceRowId) {
    throw new ServiceMutationError("A source row is required for a move", 400);
  }

  if (isDatabaseHostPageId(input.pageId, existing.parentPageId)) {
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
        eq(databaseRow.dataSourceId, existing.id),
        isNull(databaseRow.deletedAt),
      ),
    )
    .orderBy(asc(databaseRow.position));

  const sourceRows =
    sourceDataSource && input.sourceRowId
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
              eq(databaseRow.dataSourceId, sourceDataSource.id),
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
        eq(databaseProperty.dataSourceId, existing.id),
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
        eq(favorite.databaseId, existing.parentDatabaseId),
      ),
    )
    .limit(1);
  const shouldInheritFavorite = Boolean(databaseFavorite);

  const rowId = crypto.randomUUID();
  let createdAt = "";

  const targetChanged = sourceDataSource
    ? (["rows", "properties", "values"] as const)
    : defaultStatusValues.length > 0
      ? (["rows", "values"] as const)
      : (["rows"] as const);
  const createTargetRow = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => {
    const now = new Date();
    createdAt = now.toISOString();
    const inherited = sourceDataSource
      ? await inheritDatabaseRowProperties(
          {
            now,
            pageId,
            sourceDataSourceId: sourceDataSource.id,
            sourcePropertyMode: input.sourcePropertyMode ?? "match",
            targetDataSourceId: existing.id,
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
          eq(databaseRow.dataSourceId, existing.id),
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
      dataSourceId: existing.id,
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
      parentId: existing.parentDatabaseId,
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
        ...(sourceDataSource ? { properties: inherited.properties } : {}),
        rows: [...shiftedRows, ...(delta?.rows ?? [])],
        ...(insertedValues.length > 0 || inherited.values.length > 0
          ? { values: [...insertedValues, ...inherited.values] }
          : {}),
      },
    };
  };

  let commit: DatabaseMutationCommitResult;
  let sourceCommit: DatabaseMutationCommitResult | undefined;

  if (sourceDataSource && sourceRow && input.sourceRowId) {
    const sourceDataSourceId = sourceDataSource.id;
    const sourceRowId = input.sourceRowId;
    const batch = await commitDataSourceMutationBatch(
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
              eq(databaseRow.dataSourceId, sourceDataSourceId),
            ),
          );

        await tx
          .update(databaseRow)
          .set({ parentRowId: null, updatedAt: now })
          .where(
            and(
              eq(databaseRow.dataSourceId, sourceDataSourceId),
              eq(databaseRow.parentRowId, sourceRowId),
              isNull(databaseRow.deletedAt),
            ),
          );

        const remainingSourceRowIds = remainingSourceRows.map((row) => row.id);
        await updateDatabaseRowPositions(
          tx,
          sourceDataSourceId,
          remainingSourceRowIds,
          now,
        );
        await updateDatabaseRowPlacementPositions(
          tx,
          sourceDataSourceId,
          remainingSourceRowIds,
          now,
        );

        return {
          mutations: [
            {
              changed: [...targetChanged],
              dataSourceId: existing.id,
              delta: targetResult.delta,
            },
            {
              changed: ["rows"],
              dataSourceId: sourceDataSource.id,
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
    commit = batch.commits[0]!;
    sourceCommit = batch.commits[1];
  } else {
    commit = await commitDataSourceMutation(
      {
        actorId: input.userId,
        changed: [...targetChanged],
        dataSourceId: existing.id,
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
    databaseId: existing.parentDatabaseId,
    dataSourceId: existing.id,
    rowId,
    rowPageId: pageId,
    title: title as string,
    updatedAt: createdAt,
  };
}
