import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../db";
import {
  databaseProperty,
  pageProperty,
  pagePropertyValue,
} from "../db/schema";
import {
  getPropertyNameKey,
  mergeSelectOptionsForValue,
  normalizeValueForPropertyType,
  shouldInsertUnmatchedSourceProperty,
} from "./database-property-import";
import {
  isReadOnlyPropertyType,
  normalizeDatabasePropertyType,
} from "./database-property-types";
import { validateCellValue } from "./database-property-config";
import type { DatabaseDelta } from "./database-delta";
import { upsertPagePropertyValues } from "./page-property-value-upsert";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export async function inheritDatabaseRowProperties(
  input: {
    now: Date;
    pageId: string;
    sourceDataSourceId: string;
    sourcePropertyMode: "duplicate" | "match";
    targetDataSourceId: string;
    workspaceId: string;
  },
  tx: DatabaseTransaction,
) {
  const nowIso = input.now.toISOString();
  const properties: NonNullable<DatabaseDelta["properties"]> = [];
  const values: NonNullable<DatabaseDelta["values"]> = [];
  const targetColumns = await tx
    .select({ column: databaseProperty, property: pageProperty })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.dataSourceId, input.targetDataSourceId),
        eq(pageProperty.workspaceId, input.workspaceId),
        isNull(pageProperty.deletedAt),
      ),
    );
  const sourceColumns = await tx
    .select({ column: databaseProperty, property: pageProperty })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.dataSourceId, input.sourceDataSourceId),
        eq(pageProperty.workspaceId, input.workspaceId),
        isNull(pageProperty.deletedAt),
      ),
    )
    .orderBy(asc(databaseProperty.position));
  const targetPropertyIds = new Set(
    targetColumns.map(({ column }) => column.propertyId),
  );
  const targetValues =
    targetPropertyIds.size > 0
      ? await tx
          .select()
          .from(pagePropertyValue)
          .where(
            and(
              eq(pagePropertyValue.pageId, input.pageId),
              inArray(pagePropertyValue.propertyId, [...targetPropertyIds]),
            ),
          )
      : [];

  values.push(
    ...targetValues.map((value) => ({
      ...value,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
    })),
  );

  const targetColumnsByName = new Map(
    targetColumns.map((column) => [
      getPropertyNameKey(column.property.name),
      column,
    ]),
  );
  const missingColumns = sourceColumns.filter(
    ({ column }) => !targetPropertyIds.has(column.propertyId),
  );
  const sourceValues =
    missingColumns.length > 0
      ? await tx
          .select()
          .from(pagePropertyValue)
          .where(
            and(
              eq(pagePropertyValue.pageId, input.pageId),
              inArray(
                pagePropertyValue.propertyId,
                missingColumns.map(({ column }) => column.propertyId),
              ),
            ),
          )
      : [];
  const sourceValueByPropertyId = new Map(
    sourceValues.map((value) => [value.propertyId, value]),
  );
  const columnsToInsert: typeof missingColumns = [];
  const matchedValuesToUpsert: Array<typeof pagePropertyValue.$inferInsert> =
    [];

  for (const sourceColumn of missingColumns) {
    const targetColumn =
      input.sourcePropertyMode === "match"
        ? targetColumnsByName.get(
            getPropertyNameKey(sourceColumn.property.name),
          )
        : null;
    const sourceValue = sourceValueByPropertyId.get(
      sourceColumn.column.propertyId,
    );
    const targetPropertyType = targetColumn
      ? normalizeDatabasePropertyType(targetColumn.property.type)
      : null;

    if (!targetColumn) {
      if (shouldInsertUnmatchedSourceProperty(input.sourcePropertyMode)) {
        columnsToInsert.push(sourceColumn);
      }
      continue;
    }

    if (!sourceValue || sourceValue.value === null || !targetPropertyType) {
      continue;
    }

    if (isReadOnlyPropertyType(targetPropertyType)) {
      continue;
    }

    const nextValue = normalizeValueForPropertyType(
      targetPropertyType,
      sourceValue.value,
    );

    if (nextValue === null) {
      continue;
    }

    const mergedConfig = mergeSelectOptionsForValue(
      targetPropertyType,
      targetColumn.property.config,
      nextValue,
    );

    validateCellValue(targetPropertyType, mergedConfig.config, nextValue);

    if (mergedConfig.changed) {
      await tx
        .update(pageProperty)
        .set({ config: mergedConfig.config, updatedAt: input.now })
        .where(eq(pageProperty.id, targetColumn.property.id));
      await tx
        .update(databaseProperty)
        .set({ updatedAt: input.now })
        .where(eq(databaseProperty.id, targetColumn.column.id));

      properties.push({
        ...targetColumn.column,
        createdAt: targetColumn.column.createdAt.toISOString(),
        updatedAt: nowIso,
        property: {
          ...targetColumn.property,
          config: mergedConfig.config,
          createdAt: targetColumn.property.createdAt.toISOString(),
          updatedAt: nowIso,
        },
      });
    }

    matchedValuesToUpsert.push({
      createdAt: input.now,
      id: crypto.randomUUID(),
      pageId: input.pageId,
      propertyId: targetColumn.property.id,
      updatedAt: input.now,
      value: nextValue,
    });
    values.push({
      pageId: input.pageId,
      propertyId: targetColumn.property.id,
      updatedAt: nowIso,
      value: nextValue,
    });
  }

  await upsertPagePropertyValues(tx, matchedValuesToUpsert);

  if (columnsToInsert.length > 0) {
    const insertedColumns = columnsToInsert.map(({ column }, index) => ({
      createdAt: input.now,
      dataSourceId: input.targetDataSourceId,
      id: crypto.randomUUID(),
      position: targetColumns.length + index,
      propertyId: column.propertyId,
      updatedAt: input.now,
      visible: column.visible,
      width: column.width,
    }));

    await tx.insert(databaseProperty).values(insertedColumns);
    properties.push(
      ...insertedColumns.map((column, index) => ({
        ...column,
        createdAt: nowIso,
        property: columnsToInsert[index].property,
        updatedAt: nowIso,
      })),
    );
    values.push(
      ...sourceValues
        .filter((value) =>
          insertedColumns.some(
            (column) => column.propertyId === value.propertyId,
          ),
        )
        .map((value) => ({
          ...value,
          createdAt: value.createdAt.toISOString(),
          updatedAt: value.updatedAt.toISOString(),
        })),
    );
  }

  return { properties, values };
}
