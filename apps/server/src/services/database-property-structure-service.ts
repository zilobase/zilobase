import { and, asc, eq, isNull } from "drizzle-orm";

import type { RuntimeEnv } from "../config";
import { databaseProperty, pageProperty } from "../db/schema";
import { requireDatabaseEditAccess } from "./database-access";
import { commitDatabaseMutation } from "./database-commit";
import { propertyPositionDelta } from "./database-delta";
import {
  hasDuplicateValues,
  updateDatabasePropertyPositions,
} from "./database-position-service";
import { ServiceMutationError } from "./mutation-error";

export async function reorderDatabasePropertiesService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  propertyIds: string[];
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );

  if (hasDuplicateValues(input.propertyIds)) {
    throw new ServiceMutationError(
      "propertyIds must not contain duplicates",
      400,
    );
  }

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["properties"],
      databaseId: existing.id,
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
            eq(databaseProperty.databaseId, existing.id),
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

  return { commit, databaseId: existing.id };
}

export async function deleteDatabasePropertyService(input: {
  databaseId: string;
  databasePropertyId: string;
  env?: RuntimeEnv;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["properties"],
      databaseId: existing.id,
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
            eq(databaseProperty.databaseId, existing.id),
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
            eq(databaseProperty.databaseId, existing.id),
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

  return { commit, databaseId: existing.id };
}
