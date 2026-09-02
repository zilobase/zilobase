import { and, asc, eq, isNull } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { databaseProperty, pageProperty } from "../../../infrastructure/database/schema";
import { requireDataSourceEditAccess } from "../access/data-source-access";
import { commitDataSourceMutation } from "../core/commit";
import { propertyPositionDelta } from "../realtime/delta";
import {
  hasDuplicateValues,
  updateDatabasePropertyPositions,
} from "../core/position-service";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { invalidateDatabaseAutomationDependencies } from "../automations/service";
import type { Database } from "../../../infrastructure/database";

export async function reorderDatabasePropertiesService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  propertyIds: string[];
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );

  if (hasDuplicateValues(input.propertyIds)) {
    throw new ServiceMutationError(
      "propertyIds must not contain duplicates",
      400,
    );
  }

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: ["properties"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const properties = await tx
        .select({ id: databaseProperty.id })
        .from(databaseProperty)
        .innerJoin(
          pageProperty,
          eq(databaseProperty.propertyId, pageProperty.id),
        )
        .where(
          and(
            eq(databaseProperty.dataSourceId, existing.id),
            isNull(pageProperty.deletedAt),
          ),
        );
      const existingPropertyIds = new Set(
        properties.map((property) => property.id),
      );

      if (
        input.propertyIds.length !== existingPropertyIds.size ||
        input.propertyIds.some(
          (propertyId) => !existingPropertyIds.has(propertyId),
        )
      ) {
        throw new ServiceMutationError(
          "propertyIds must include every active database property",
          400,
        );
      }

      await updateDatabasePropertyPositions(
        tx,
        existing.id,
        input.propertyIds,
        new Date(),
      );

      return { delta: propertyPositionDelta(input.propertyIds) };
    },
  );

  return { commit, dataSourceId: existing.id };
}

export async function deleteDatabasePropertyService(input: {
  databaseId: string;
  databasePropertyId: string;
  env?: RuntimeEnv;
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );
  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: ["properties"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const [source] = await tx
        .select({
          columnId: databaseProperty.id,
          pagePropertyId: pageProperty.id,
        })
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

      const activeProperties = await tx
        .select({ id: databaseProperty.id })
        .from(databaseProperty)
        .innerJoin(
          pageProperty,
          eq(databaseProperty.propertyId, pageProperty.id),
        )
        .where(
          and(
            eq(databaseProperty.dataSourceId, existing.id),
            isNull(pageProperty.deletedAt),
          ),
        )
        .orderBy(asc(databaseProperty.position));
      const remainingPropertyIds = activeProperties
        .map((property) => property.id)
        .filter((propertyId) => propertyId !== source.columnId);
      const now = new Date();

      await tx
        .update(pageProperty)
        .set({ deletedAt: now, deletedById: input.userId, updatedAt: now })
        .where(eq(pageProperty.id, source.pagePropertyId));
      await tx
        .update(databaseProperty)
        .set({ updatedAt: now })
        .where(eq(databaseProperty.id, source.columnId));
      await invalidateDatabaseAutomationDependencies({
        dependencyId: source.columnId,
        dependencyType: "property",
        executor: tx as unknown as Database,
        reason: "A property used by this automation was deleted",
      });
      await updateDatabasePropertyPositions(
        tx,
        existing.id,
        remainingPropertyIds,
        now,
      );

      return {
        delta: {
          ...propertyPositionDelta(remainingPropertyIds),
          removedPagePropertyIds: [source.pagePropertyId],
          removedPropertyIds: [source.columnId],
        },
      };
    },
  );

  return { commit, dataSourceId: existing.id };
}
