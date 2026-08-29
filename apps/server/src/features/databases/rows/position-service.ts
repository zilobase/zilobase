import { and, eq, isNull } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import {
  databaseProperty,
  databaseRow,
  page,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { requireDataSourceEditAccess } from "../access/data-source-access";
import { commitDataSourceMutation } from "../core/commit";
import { rowPositionDelta } from "../realtime/delta";
import {
  hasDuplicateValues,
  updateDatabaseRowPlacementPositions,
  updateDatabaseRowPositions,
} from "../core/position-service";
import { validateCellValue } from "../properties/config";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

const validateCompleteRowOrder = (
  rowIds: string[],
  existingRowIds: Set<string>,
) => {
  if (
    rowIds.length !== existingRowIds.size ||
    rowIds.some((rowId) => !existingRowIds.has(rowId))
  ) {
    throw new ServiceMutationError(
      "rowIds must include every active database row",
      400,
    );
  }
};

export async function reorderDatabaseRowsService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  rowIds: string[];
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );

  if (hasDuplicateValues(input.rowIds)) {
    throw new ServiceMutationError("rowIds must not contain duplicates", 400);
  }

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: ["rows"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const rows = await tx
        .select({ id: databaseRow.id })
        .from(databaseRow)
        .where(
          and(
            eq(databaseRow.dataSourceId, existing.id),
            isNull(databaseRow.deletedAt),
          ),
        );

      validateCompleteRowOrder(
        input.rowIds,
        new Set(rows.map((row) => row.id)),
      );
      const now = new Date();
      await updateDatabaseRowPositions(tx, existing.id, input.rowIds, now);
      await updateDatabaseRowPlacementPositions(
        tx,
        existing.id,
        input.rowIds,
        now,
      );

      return { delta: rowPositionDelta(input.rowIds) };
    },
  );

  return { commit, dataSourceId: existing.id };
}

export async function moveDatabaseRowService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  groupPropertyId?: string;
  groupValue?: unknown;
  rowId: string;
  rowIds: string[];
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );

  if (hasDuplicateValues(input.rowIds)) {
    throw new ServiceMutationError("rowIds must not contain duplicates", 400);
  }

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: input.groupPropertyId ? ["rows", "values"] : ["rows"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const rows = await tx
        .select({ id: databaseRow.id, pageId: databaseRow.pageId })
        .from(databaseRow)
        .where(
          and(
            eq(databaseRow.dataSourceId, existing.id),
            isNull(databaseRow.deletedAt),
          ),
        );
      const row = rows.find((item) => item.id === input.rowId);

      if (!row) {
        throw new ServiceMutationError("Row not found", 404);
      }

      validateCompleteRowOrder(
        input.rowIds,
        new Set(rows.map((item) => item.id)),
      );

      let property: { config: unknown; id: string; type: string } | null = null;
      if (input.groupPropertyId) {
        const [groupProperty] = await tx
          .select({
            config: pageProperty.config,
            id: pageProperty.id,
            type: pageProperty.type,
          })
          .from(databaseProperty)
          .innerJoin(
            pageProperty,
            eq(databaseProperty.propertyId, pageProperty.id),
          )
          .where(
            and(
              eq(databaseProperty.dataSourceId, existing.id),
              eq(databaseProperty.propertyId, input.groupPropertyId),
              eq(pageProperty.workspaceId, existing.workspaceId),
              isNull(pageProperty.deletedAt),
            ),
          )
          .limit(1);

        if (!groupProperty) {
          throw new ServiceMutationError("Property not found", 404);
        }

        validateCellValue(
          groupProperty.type,
          groupProperty.config,
          input.groupValue ?? null,
        );
        property = groupProperty;
      }

      const now = new Date();
      await updateDatabaseRowPositions(tx, existing.id, input.rowIds, now);
      await updateDatabaseRowPlacementPositions(
        tx,
        existing.id,
        input.rowIds,
        now,
      );

      if (property) {
        await tx
          .insert(pagePropertyValue)
          .values({
            id: crypto.randomUUID(),
            pageId: row.pageId,
            propertyId: property.id,
            value: input.groupValue ?? null,
          })
          .onConflictDoUpdate({
            set: { value: input.groupValue ?? null, updatedAt: now },
            target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
          });
        await tx
          .update(databaseRow)
          .set({ lastEditedById: input.userId, updatedAt: now })
          .where(
            and(
              eq(databaseRow.id, input.rowId),
              eq(databaseRow.dataSourceId, existing.id),
            ),
          );
        await tx.update(page).set({ updatedAt: now }).where(eq(page.id, row.pageId));
      }

      const positionedRows = rowPositionDelta(input.rowIds).rows ?? [];
      return {
        delta: {
          rows: positionedRows.map((positionedRow) =>
            property && positionedRow.id === input.rowId
              ? {
                  ...positionedRow,
                  lastEditedById: input.userId,
                  updatedAt: now.toISOString(),
                }
              : positionedRow,
          ),
          ...(property
            ? {
                values: [
                  {
                    pageId: row.pageId,
                    propertyId: property.id,
                    updatedAt: now.toISOString(),
                    value: input.groupValue ?? null,
                  },
                ],
              }
            : {}),
        },
      };
    },
  );

  return { commit, dataSourceId: existing.id };
}
