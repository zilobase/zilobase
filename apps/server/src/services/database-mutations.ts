import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { canAccessPage } from "../access";
import type { RuntimeEnv } from "../config";
import { db } from "../db";
import {
  databaseProperty,
  databaseRow,
  page,
  pageCollaborationDocument,
  pageProperty,
  pagePropertyValue,
} from "../db/schema";
import { upsertPageItemPlacement } from "../page-item-placements";
import { encodePageContentAsYjs } from "../collaboration/service";
import { commitDatabaseMutation } from "./database-commit";
import { requireDatabaseEditAccess } from "./database-access";
import {
  normalizeDatabasePropertyType,
  shouldClearValuesForPropertyTypeChange,
} from "./database-property-types";
import {
  fetchDatabasePropertyDelta,
  fetchDatabaseRowDelta,
  type DatabaseDelta,
} from "./database-delta";
import { isDatabaseHostPageId } from "./database-host-page";
import {
  formatDatePropertyValueAsText,
  getStatusDefaultValue,
  normalizePropertyConfig,
} from "./database-property-config";
import { ServiceMutationError } from "./mutation-error";

export { isDatabaseHostPageId } from "./database-host-page";
export { getDatabaseRecord } from "./database-access";
export {
  defaultStatusOptions,
  formatDatePropertyValueAsText,
  normalizePropertyConfig,
  selectOptionColors,
  validateCellValue,
} from "./database-property-config";
export { ServiceMutationError } from "./mutation-error";
export {
  createDatabaseService,
  updateDatabaseService,
} from "./database-service";
export { setDatabaseCellValueService } from "./database-cell-service";
export {
  createDatabaseViewService,
  updateDatabaseViewService,
} from "./database-view-service";

export async function createDatabasePropertyService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;

  name?: string;
  position?: number;
  type?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const name = input.name?.trim() || "Property";
  const type = normalizeDatabasePropertyType(input.type) ?? "";

  if (!type) {
    throw new ServiceMutationError("Unsupported property type", 400);
  }

  const config = normalizePropertyConfig(type, input.config ?? null);

  const columns = await db
    .select({ id: databaseProperty.id, position: databaseProperty.position })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.databaseId, existing.id),
        isNull(pageProperty.deletedAt),
      ),
    );

  const pagePropertyId = crypto.randomUUID();
  const databasePropertyId = crypto.randomUUID();
  const targetPosition =
    input.position === undefined
      ? columns.length
      : Math.min(input.position, columns.length);

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["properties"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const now = new Date();

      await tx
        .update(databaseProperty)
        .set({
          position: sql`${databaseProperty.position} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(databaseProperty.databaseId, existing.id),
            gte(databaseProperty.position, targetPosition),
          ),
        );
      await tx.insert(pageProperty).values({
        id: pagePropertyId,
        workspaceId: existing.workspaceId,
        name,
        type,
        config,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(databaseProperty).values({
        id: databasePropertyId,
        databaseId: existing.id,
        propertyId: pagePropertyId,
        position: targetPosition,
        createdAt: now,
        updatedAt: now,
      });

      const delta = await fetchDatabasePropertyDelta(
        existing.id,
        databasePropertyId,
        tx,
      );

      return {
        delta: {
          properties: [
            ...columns
              .filter((column) => column.position >= targetPosition)
              .map((column) => ({
                id: column.id,
                position: column.position + 1,
                updatedAt: now.toISOString(),
              })),
            ...(delta?.properties ?? []),
          ],
        },
      };
    },
  );

  return {
    databaseId: existing.id,
    databasePropertyId,
    name,
    type,
    pagePropertyId,
  };
}

export async function updateDatabasePropertyService(input: {
  config?: unknown;
  databaseId: string;
  databasePropertyId: string;
  env?: RuntimeEnv;

  name?: string;
  position?: number;
  type?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );

  const [column] = await db
    .select()
    .from(databaseProperty)
    .where(
      and(
        eq(databaseProperty.id, input.databasePropertyId),
        eq(databaseProperty.databaseId, existing.id),
      ),
    )
    .limit(1);

  if (!column) {
    throw new ServiceMutationError("Property not found", 404);
  }

  const [pagePropertyRecord] = await db
    .select({ config: pageProperty.config, type: pageProperty.type })
    .from(pageProperty)
    .where(
      and(
        eq(pageProperty.id, column.propertyId),
        eq(pageProperty.workspaceId, existing.workspaceId),
      ),
    )
    .limit(1);

  if (!pagePropertyRecord) {
    throw new ServiceMutationError("Property not found", 404);
  }

  const columnValues: Partial<typeof databaseProperty.$inferInsert> = {
    updatedAt: new Date(),
  };
  const propertyValues: Partial<typeof pageProperty.$inferInsert> = {
    updatedAt: new Date(),
  };
  const effectiveType = normalizeDatabasePropertyType(
    input.type ?? pagePropertyRecord.type,
  );
  const previousType = normalizeDatabasePropertyType(
    pagePropertyRecord.type,
    "",
  );

  if (!effectiveType) {
    throw new ServiceMutationError("Unsupported property type", 400);
  }

  if (input.name !== undefined) {
    propertyValues.name = input.name;
  }

  if (input.type !== undefined) {
    propertyValues.type = effectiveType;
  }

  if (input.config !== undefined) {
    propertyValues.config = normalizePropertyConfig(
      effectiveType,
      input.config,
    );
  } else if (effectiveType === "status" && input.type !== undefined) {
    propertyValues.config = normalizePropertyConfig(
      "status",
      pagePropertyRecord.config,
    );
  }

  if (input.position !== undefined) {
    columnValues.position = input.position;
  }

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed:
        input.type !== undefined &&
        previousType &&
        effectiveType !== previousType &&
        (shouldClearValuesForPropertyTypeChange(previousType, effectiveType) ||
          (previousType === "date" && effectiveType === "text"))
          ? ["properties", "values"]
          : ["properties"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const shouldClearValues = Boolean(
        input.type !== undefined &&
        previousType &&
        effectiveType !== previousType &&
        shouldClearValuesForPropertyTypeChange(previousType, effectiveType),
      );
      const shouldConvertDateToText =
        previousType === "date" && effectiveType === "text";
      const changedValues = shouldClearValues
        ? await tx
            .update(pagePropertyValue)
            .set({ value: null, updatedAt: new Date() })
            .where(eq(pagePropertyValue.propertyId, column.propertyId))
            .returning({
              createdAt: pagePropertyValue.createdAt,
              id: pagePropertyValue.id,
              pageId: pagePropertyValue.pageId,
              propertyId: pagePropertyValue.propertyId,
              updatedAt: pagePropertyValue.updatedAt,
              value: pagePropertyValue.value,
            })
        : shouldConvertDateToText
          ? await Promise.all(
              (
                await tx
                  .select({
                    id: pagePropertyValue.id,
                    value: pagePropertyValue.value,
                  })
                  .from(pagePropertyValue)
                  .where(eq(pagePropertyValue.propertyId, column.propertyId))
              ).map(async (propertyValue) => {
                const [updatedValue] = await tx
                  .update(pagePropertyValue)
                  .set({
                    value: formatDatePropertyValueAsText(propertyValue.value),
                    updatedAt: new Date(),
                  })
                  .where(eq(pagePropertyValue.id, propertyValue.id))
                  .returning({
                    createdAt: pagePropertyValue.createdAt,
                    id: pagePropertyValue.id,
                    pageId: pagePropertyValue.pageId,
                    propertyId: pagePropertyValue.propertyId,
                    updatedAt: pagePropertyValue.updatedAt,
                    value: pagePropertyValue.value,
                  });

                return updatedValue;
              }),
            )
          : [];

      await tx
        .update(databaseProperty)
        .set(columnValues)
        .where(eq(databaseProperty.id, column.id));

      if (
        input.name !== undefined ||
        input.type !== undefined ||
        input.config !== undefined
      ) {
        await tx
          .update(pageProperty)
          .set(propertyValues)
          .where(
            and(
              eq(pageProperty.id, column.propertyId),
              eq(pageProperty.workspaceId, existing.workspaceId),
            ),
          );
      }

      const delta = await fetchDatabasePropertyDelta(
        existing.id,
        column.id,
        tx,
      );

      return {
        delta: {
          ...(delta ?? { properties: [] }),
          ...(changedValues.length > 0
            ? {
                values: changedValues.map((value) => ({
                  ...value,
                  createdAt: value.createdAt.toISOString(),
                  updatedAt: value.updatedAt.toISOString(),
                })),
              }
            : {}),
        },
      };
    },
  );

  return {
    databaseId: existing.id,
    databasePropertyId: column.id,
    pagePropertyId: column.propertyId,
  };
}

export async function createDatabaseRowService(input: {
  databaseId: string;
  env?: RuntimeEnv;

  pageId?: string | null;
  parentRowId?: string | null;
  position?: number;
  title?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );

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

  const rowId = crypto.randomUUID();

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: defaultStatusValues.length > 0 ? ["rows", "values"] : ["rows"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const now = new Date();

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

      const insertedValues = defaultStatusValues.map((property) => ({
        createdAt: now.toISOString(),
        id: crypto.randomUUID(),
        propertyId: property.propertyId,
        updatedAt: now.toISOString(),
        value: property.value,
        pageId: pageId,
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
          rows: [...shiftedRows, ...(delta?.rows ?? [])],
          ...(insertedValues.length > 0 ? { values: insertedValues } : {}),
        },
      };
    },
  );

  return {
    databaseId: existing.id,
    rowId,
    rowPageId: pageId,
    title: title as string,
  };
}
