import { and, eq, gte, isNull, sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import {
  databaseProperty,
  databaseRow,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { requireDataSourceEditAccess } from "../access/data-source-access";
import { commitDataSourceMutation } from "../core/commit";
import { fetchDatabasePropertyDelta } from "../realtime/delta";
import { getDuplicatePropertyName } from "./import";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

export async function duplicateDatabasePropertyService(input: {
  databaseId: string;
  databasePropertyId: string;
  env?: RuntimeEnv;
  includeValues?: boolean;
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );
  const includeValues = input.includeValues ?? false;
  const newPropertyId = crypto.randomUUID();
  const databasePropertyId = crypto.randomUUID();
  let duplicateName = "";

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: includeValues ? ["properties", "values"] : ["properties"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const [source] = await tx
        .select({ column: databaseProperty, property: pageProperty })
        .from(databaseProperty)
        .innerJoin(
          pageProperty,
          eq(databaseProperty.propertyId, pageProperty.id),
        )
        .where(
          and(
            eq(databaseProperty.id, input.databasePropertyId),
            eq(databaseProperty.dataSourceId, existing.id),
            eq(pageProperty.workspaceId, existing.workspaceId),
            isNull(pageProperty.deletedAt),
          ),
        )
        .limit(1);

      if (!source) {
        throw new ServiceMutationError("Property not found", 404);
      }

      const existingProperties = await tx
        .select({
          id: databaseProperty.id,
          name: pageProperty.name,
          position: databaseProperty.position,
        })
        .from(databaseProperty)
        .innerJoin(
          pageProperty,
          eq(databaseProperty.propertyId, pageProperty.id),
        )
        .where(
          and(
            eq(databaseProperty.dataSourceId, existing.id),
            eq(pageProperty.workspaceId, existing.workspaceId),
            isNull(pageProperty.deletedAt),
          ),
        );
      const sourceValues = includeValues
        ? await tx
            .select({
              pageId: pagePropertyValue.pageId,
              value: pagePropertyValue.value,
            })
            .from(pagePropertyValue)
            .innerJoin(
              databaseRow,
              eq(pagePropertyValue.pageId, databaseRow.pageId),
            )
            .where(
              and(
                eq(pagePropertyValue.propertyId, source.property.id),
                eq(databaseRow.dataSourceId, existing.id),
                isNull(databaseRow.deletedAt),
              ),
            )
        : [];
      const targetPosition = source.column.position + 1;
      const now = new Date();
      duplicateName = getDuplicatePropertyName(
        source.property.name,
        new Set(existingProperties.map((property) => property.name)),
      );

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
        config: source.property.config,
        createdAt: now,
        id: newPropertyId,
        name: duplicateName,
        type: source.property.type,
        updatedAt: now,
        workspaceId: existing.workspaceId,
      });
      await tx.insert(databaseProperty).values({
        createdAt: now,
        dataSourceId: existing.id,
        id: databasePropertyId,
        position: targetPosition,
        propertyId: newPropertyId,
        updatedAt: now,
      });

      const insertedValues = sourceValues.map((propertyValue) => ({
        createdAt: now.toISOString(),
        id: crypto.randomUUID(),
        pageId: propertyValue.pageId,
        propertyId: newPropertyId,
        updatedAt: now.toISOString(),
        value: propertyValue.value,
      }));

      if (insertedValues.length > 0) {
        await tx.insert(pagePropertyValue).values(
          insertedValues.map((propertyValue) => ({
            ...propertyValue,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      const delta = await fetchDatabasePropertyDelta(
        existing.id,
        databasePropertyId,
        tx,
      );

      return {
        delta: {
          properties: [
            ...existingProperties
              .filter((property) => property.position >= targetPosition)
              .map((property) => ({
                id: property.id,
                position: property.position + 1,
                updatedAt: now.toISOString(),
              })),
            ...(delta?.properties ?? []),
          ],
          ...(insertedValues.length > 0 ? { values: insertedValues } : {}),
        },
      };
    },
  );

  return {
    commit,
    dataSourceId: existing.id,
    databasePropertyId,
    name: duplicateName,
    pagePropertyId: newPropertyId,
  };
}
