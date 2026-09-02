import { and, eq, gte, isNull, sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  databaseProperty,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { requireDataSourceEditAccess } from "../access/data-source-access";
import { commitDataSourceMutation } from "../core/commit";
import { fetchDatabasePropertyDelta } from "../realtime/delta";
import {
  formatDatePropertyValueAsText,
  normalizePropertyConfig,
} from "./config";
import {
  normalizeDatabasePropertyType,
  shouldClearValuesForPropertyTypeChange,
} from "./types";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { invalidateDatabaseAutomationDependencies } from "../automations/service";
import type { Database } from "../../../infrastructure/database";

export async function createDatabasePropertyService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name?: string;
  position?: number;
  type?: string;
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
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
        eq(databaseProperty.dataSourceId, existing.id),
        isNull(pageProperty.deletedAt),
      ),
    );

  const pagePropertyId = crypto.randomUUID();
  const databasePropertyId = crypto.randomUUID();
  const targetPosition =
    input.position === undefined
      ? columns.length
      : Math.min(input.position, columns.length);

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: ["properties"],
      dataSourceId: existing.id,
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
            eq(databaseProperty.dataSourceId, existing.id),
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
        dataSourceId: existing.id,
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
    commit,
    databaseId: existing.parentDatabaseId,
    dataSourceId: existing.id,
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
  mergeConfig?: boolean;
  name?: string;
  position?: number;
  type?: string;
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );

  const [column] = await db
    .select()
    .from(databaseProperty)
    .where(
      and(
        eq(databaseProperty.id, input.databasePropertyId),
        eq(databaseProperty.dataSourceId, existing.id),
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
    const config = input.mergeConfig &&
        pagePropertyRecord.config &&
        typeof pagePropertyRecord.config === "object" &&
        !Array.isArray(pagePropertyRecord.config) &&
        input.config &&
        typeof input.config === "object" &&
        !Array.isArray(input.config)
      ? {
          ...(pagePropertyRecord.config as Record<string, unknown>),
          ...(input.config as Record<string, unknown>),
        }
      : input.config;
    propertyValues.config = normalizePropertyConfig(
      effectiveType,
      config,
    );
  } else if (effectiveType === "status" && input.type !== undefined) {
    propertyValues.config = normalizePropertyConfig(
      "status",
      pagePropertyRecord.config,
    );
  }

  const removedAutomationOptions =
    input.config !== undefined &&
    effectiveType === previousType &&
    ["select", "status", "multi_select"].includes(effectiveType)
      ? removedPropertyOptions(
          pagePropertyRecord.config,
          propertyValues.config,
        )
      : [];
  const optionValueChanges =
    input.config !== undefined &&
    effectiveType === previousType &&
    ["select", "status", "multi_select"].includes(effectiveType)
      ? changedPropertyOptions(
          pagePropertyRecord.config,
          propertyValues.config,
        )
      : [];

  if (input.position !== undefined) {
    columnValues.position = input.position;
  }

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed:
        (input.type !== undefined &&
          previousType &&
          effectiveType !== previousType &&
          (shouldClearValuesForPropertyTypeChange(previousType, effectiveType) ||
            (previousType === "date" && effectiveType === "text"))) ||
        optionValueChanges.length > 0
          ? ["properties", "values"]
          : ["properties"],
      dataSourceId: existing.id,
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
        // automation-origin: system. Property-type migration writes invalidate
        // dependencies but are not user row-property edit triggers.
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
          : optionValueChanges.length > 0
            ? await Promise.all(
                (
                  await tx
                    .select({
                      id: pagePropertyValue.id,
                      value: pagePropertyValue.value,
                    })
                    .from(pagePropertyValue)
                    .where(eq(pagePropertyValue.propertyId, column.propertyId))
                ).flatMap((propertyValue) => {
                  const nextValue = migrateOptionValue(
                    effectiveType,
                    propertyValue.value,
                    optionValueChanges,
                  );
                  if (JSON.stringify(nextValue) === JSON.stringify(propertyValue.value)) {
                    return [];
                  }
                  return [tx
                    .update(pagePropertyValue)
                    .set({ value: nextValue, updatedAt: new Date() })
                    .where(eq(pagePropertyValue.id, propertyValue.id))
                    .returning({
                      createdAt: pagePropertyValue.createdAt,
                      id: pagePropertyValue.id,
                      pageId: pagePropertyValue.pageId,
                      propertyId: pagePropertyValue.propertyId,
                      updatedAt: pagePropertyValue.updatedAt,
                      value: pagePropertyValue.value,
                    })
                    .then(([updatedValue]) => updatedValue)];
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

      if (input.type !== undefined && effectiveType !== previousType) {
        await invalidateDatabaseAutomationDependencies({
          dependencyId: column.id,
          dependencyType: "property",
          executor: tx as unknown as Database,
          reason: `A property used by this automation changed from ${previousType} to ${effectiveType}`,
        });
      }
      for (const option of removedAutomationOptions) {
        await invalidateDatabaseAutomationDependencies({
          dependencyId: option.id,
          dependencyType: "option",
          executor: tx as unknown as Database,
          reason: `The ${option.name} option used by this automation was deleted`,
          workspaceId: existing.workspaceId,
        });
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
    commit,
    databaseId: existing.parentDatabaseId,
    dataSourceId: existing.id,
    databasePropertyId: column.id,
    pagePropertyId: column.propertyId,
  };
}

function removedPropertyOptions(previousConfig: unknown, nextConfig: unknown) {
  const nextIds = new Set(propertyOptions(nextConfig).map(({ id }) => id));
  return propertyOptions(previousConfig).filter(({ id }) => !nextIds.has(id));
}

function changedPropertyOptions(previousConfig: unknown, nextConfig: unknown) {
  const nextOptions = new Map(propertyOptions(nextConfig).map((option) => [option.id, option]));
  return propertyOptions(previousConfig).flatMap((option) => {
    const nextOption = nextOptions.get(option.id);
    return nextOption?.name === option.name
      ? []
      : [{ oldName: option.name, newName: nextOption?.name ?? null }];
  });
}

function migrateOptionValue(
  propertyType: string,
  value: unknown,
  changes: Array<{ oldName: string; newName: string | null }>,
) {
  const replacements = new Map(changes.map(({ oldName, newName }) => [oldName, newName]));
  if (propertyType === "multi_select") {
    if (!Array.isArray(value)) return value;
    return [...new Set(value.flatMap((item) => {
      if (typeof item !== "string" || !replacements.has(item)) return [item];
      const replacement = replacements.get(item);
      return replacement === null || replacement === undefined ? [] : [replacement];
    }))];
  }
  if (typeof value !== "string" || !replacements.has(value)) return value;
  return replacements.get(value) ?? null;
}

function propertyOptions(config: unknown): Array<{ id: string; name: string }> {
  if (!config || typeof config !== "object" || !Array.isArray((config as { options?: unknown }).options)) {
    return [];
  }
  return (config as { options: unknown[] }).options.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const { id, name } = option as { id?: unknown; name?: unknown };
    return typeof id === "string" && typeof name === "string" ? [{ id, name }] : [];
  });
}
