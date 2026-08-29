import { and, eq, isNull } from "drizzle-orm";

import type { RuntimeEnv } from "../shared/config/config";
import { db } from "../infrastructure/database";
import {
  databaseProperty,
  databaseRow,
  page,
  pageProperty,
  pagePropertyValue,
} from "../infrastructure/database/schema";
import { requireDataSourceEditAccess } from "./data-source-access";
import { commitDataSourceMutation } from "./database-commit";
import type { DatabaseDelta } from "./database-delta";
import { validateCellValue } from "./database-property-config";
import { ServiceMutationError } from "./mutation-error";

export async function setDatabaseCellValueService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  rowId: string;
  userId: string;
  value: unknown;
  pagePropertyId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );

  const [row] = await db
    .select({ id: databaseRow.id, pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.id, input.rowId),
        eq(databaseRow.dataSourceId, existing.id),
        isNull(databaseRow.deletedAt),
      ),
    )
    .limit(1);

  const [property] = await db
    .select({
      config: pageProperty.config,
      id: pageProperty.id,
      type: pageProperty.type,
    })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.dataSourceId, existing.id),
        eq(databaseProperty.propertyId, input.pagePropertyId),
        eq(pageProperty.workspaceId, existing.workspaceId),
        isNull(pageProperty.deletedAt),
      ),
    )
    .limit(1);

  if (!row || !property) {
    throw new ServiceMutationError("Row or property not found", 404);
  }

  validateCellValue(property.type, property.config, input.value);

  const now = new Date();

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: ["rows", "values"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx
        .insert(pagePropertyValue)
        .values({
          id: crypto.randomUUID(),
          pageId: row.pageId,
          propertyId: input.pagePropertyId,
          value: input.value,
        })
        .onConflictDoUpdate({
          target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
          set: { value: input.value, updatedAt: now },
        });
      await tx
        .update(databaseRow)
        .set({ lastEditedById: input.userId, updatedAt: now })
        .where(eq(databaseRow.id, row.id));
      await tx
        .update(page)
        .set({ updatedAt: now })
        .where(eq(page.id, row.pageId));

      return {
        delta: {
          rows: [
            {
              id: row.id,
              lastEditedById: input.userId,
              updatedAt: now.toISOString(),
            },
          ],
          values: [
            {
              propertyId: input.pagePropertyId,
              updatedAt: now.toISOString(),
              value: input.value,
              pageId: row.pageId,
            },
          ],
        } satisfies DatabaseDelta,
      };
    },
  );

  return {
    commit,
    databaseId: existing.parentDatabaseId,
    dataSourceId: existing.id,
    rowId: row.id,
    rowPageId: row.pageId,
    pagePropertyId: input.pagePropertyId,
  };
}
