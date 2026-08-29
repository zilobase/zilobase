import { and, asc, eq, isNull } from "drizzle-orm";
import { hasPageBodyContent } from "@zilobase/features/pages/content-state";

import { encodePageContentAsYjs } from "../collaboration/service";
import type { RuntimeEnv } from "../shared/config/config";
import { db } from "../infrastructure/database";
import {
  database,
  dataSource,
  databaseProperty,
  databaseRow,
  favorite,
  page,
  pageCollaborationDocument,
  pageItemPlacement,
  pageProperty,
  pagePropertyValue,
} from "../infrastructure/database/schema";
import { requireDataSourceEditAccess } from "./data-source-access";
import { commitDataSourceMutation } from "./database-commit";
import type { DatabaseDelta } from "./database-delta";
import { getDatabasePayload } from "./database-payload";
import {
  getStatusDefaultValue,
  normalizePropertyConfig,
  validateCellValue,
} from "./database-property-config";
import { normalizeDatabasePropertyType } from "./database-property-types";
import { ServiceMutationError } from "./mutation-error";

export type DatabaseTemplateInput = {
  config: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name: string;
  properties: Array<{
    config?: unknown;
    name: string;
    type: string;
  }>;
  rows: Array<{
    content?: unknown;
    metadata?: unknown;
    title: string;
    values: Array<{
      propertyName: string;
      value: unknown;
    }>;
  }>;
  userId: string;
};

type TemplateProperty = {
  config: unknown;
  databasePropertyId: string;
  name: string;
  pagePropertyId: string;
  position: number;
  type: string;
};

export async function applyDatabaseTemplateService(
  input: DatabaseTemplateInput,
) {
  const existing = await requireDataSourceEditAccess(
    input.databaseId,
    input.userId,
  );
  const normalizedProperties = input.properties.map((property) => {
    const type = normalizeDatabasePropertyType(property.type) ?? "";

    if (!type) {
      throw new ServiceMutationError("Unsupported property type", 400);
    }

    return {
      config: normalizePropertyConfig(type, property.config ?? null),
      name: property.name.trim() || "Property",
      type,
    };
  });

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      changed: ["dataSource", "properties", "rows", "values"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const now = new Date();
      const nowIso = now.toISOString();

      // Serialize repeated template clicks before checking for existing rows and
      // properties, so a template can never be partially or doubly seeded.
      await tx
        .select({ id: dataSource.id })
        .from(dataSource)
        .where(eq(dataSource.id, existing.id))
        .for("update");

      const [existingProperties, existingRows, databaseFavorites] =
        await Promise.all([
          tx
            .select({
              config: pageProperty.config,
              databasePropertyId: databaseProperty.id,
              name: pageProperty.name,
              pagePropertyId: pageProperty.id,
              position: databaseProperty.position,
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
                isNull(pageProperty.deletedAt),
              ),
            )
            .orderBy(asc(databaseProperty.position)),
          tx
            .select({ id: databaseRow.id })
            .from(databaseRow)
            .where(
              and(
                eq(databaseRow.dataSourceId, existing.id),
                isNull(databaseRow.deletedAt),
              ),
            )
            .limit(1),
          tx
            .select({ id: favorite.id })
            .from(favorite)
            .where(
              and(
                eq(favorite.userId, input.userId),
                eq(favorite.databaseId, existing.parentDatabaseId),
              ),
            )
            .limit(1),
        ]);

      const propertiesByName = new Map<string, TemplateProperty>(
        existingProperties.map((property) => [
          property.name.toLowerCase(),
          property,
        ]),
      );
      const createdProperties: TemplateProperty[] = [];

      for (const property of normalizedProperties) {
        const propertyKey = property.name.toLowerCase();

        if (propertiesByName.has(propertyKey)) {
          continue;
        }

        const created: TemplateProperty = {
          ...property,
          databasePropertyId: crypto.randomUUID(),
          pagePropertyId: crypto.randomUUID(),
          position: existingProperties.length + createdProperties.length,
        };

        createdProperties.push(created);
        propertiesByName.set(propertyKey, created);
      }
      const propertiesById = new Map(
        [...propertiesByName.values()].map((property) => [
          property.pagePropertyId,
          property,
        ]),
      );

      await tx
        .update(dataSource)
        .set({ config: input.config, name: input.name, updatedAt: now })
        .where(eq(dataSource.id, existing.id));

      if (createdProperties.length > 0) {
        await tx.insert(pageProperty).values(
          createdProperties.map((property) => ({
            config: property.config,
            createdAt: now,
            id: property.pagePropertyId,
            name: property.name,
            type: property.type,
            updatedAt: now,
            workspaceId: existing.workspaceId,
          })),
        );
        await tx.insert(databaseProperty).values(
          createdProperties.map((property) => ({
            createdAt: now,
            dataSourceId: existing.id,
            id: property.databasePropertyId,
            position: property.position,
            propertyId: property.pagePropertyId,
            updatedAt: now,
          })),
        );
      }

      const createdRows = existingRows.length === 0
        ? input.rows.map((row, position) => ({
            ...row,
            pageId: crypto.randomUUID(),
            position,
            rowId: crypto.randomUUID(),
          }))
        : [];

      if (createdRows.length > 0) {
        await tx.insert(page).values(
          createdRows.map((row) => ({
            content: row.content ?? null,
            hasContent: hasPageBodyContent(row.content),
            createdAt: now,
            createdById: input.userId,
            id: row.pageId,
            metadata: row.metadata ?? null,
            name: row.title,
            type: "pageblock",
            updatedAt: now,
            url: "#",
            workspaceId: existing.workspaceId,
          })),
        );
        await tx.insert(pageCollaborationDocument).values(
          createdRows.map((row) => ({
            createdAt: now,
            pageId: row.pageId,
            state: Buffer.from(encodePageContentAsYjs(row.content ?? null)),
            updatedAt: now,
          })),
        );
        await tx.insert(databaseRow).values(
          createdRows.map((row) => ({
            createdAt: now,
            createdById: input.userId,
            dataSourceId: existing.id,
            id: row.rowId,
            lastEditedById: input.userId,
            pageId: row.pageId,
            position: row.position,
            updatedAt: now,
          })),
        );
        await tx.insert(pageItemPlacement).values(
          createdRows.map((row) => ({
            createdAt: now,
            id: crypto.randomUUID(),
            itemId: row.pageId,
            itemKind: "page",
            parentId: existing.parentDatabaseId,
            parentKind: "database",
            placementKind: "database_row",
            position: row.position,
            sourceRowId: row.rowId,
            updatedAt: now,
            workspaceId: existing.workspaceId,
          })),
        );

        if (databaseFavorites.length > 0) {
          await tx
            .insert(favorite)
            .values(
              createdRows.map((row) => ({
                id: crypto.randomUUID(),
                pageId: row.pageId,
                userId: input.userId,
              })),
            )
            .onConflictDoNothing({ target: [favorite.userId, favorite.pageId] });
        }
      }

      const createdValues: Array<{
        createdAt: Date;
        id: string;
        pageId: string;
        propertyId: string;
        updatedAt: Date;
        value: unknown;
      }> = [];

      for (const row of createdRows) {
        const rowValues = new Map<string, unknown>();

        for (const property of propertiesByName.values()) {
          if (property.type === "status") {
            const defaultValue = getStatusDefaultValue(property.config);

            if (defaultValue !== null) {
              rowValues.set(property.pagePropertyId, defaultValue);
            }
          }
        }

        for (const item of row.values) {
          const property = propertiesByName.get(
            item.propertyName.toLowerCase(),
          );

          if (property) {
            rowValues.set(property.pagePropertyId, item.value);
          }
        }

        for (const [propertyId, value] of rowValues) {
          const property = propertiesById.get(propertyId);

          if (!property) {
            continue;
          }

          validateCellValue(property.type, property.config, value);
          createdValues.push({
            createdAt: now,
            id: crypto.randomUUID(),
            pageId: row.pageId,
            propertyId,
            updatedAt: now,
            value,
          });
        }
      }

      if (createdValues.length > 0) {
        await tx.insert(pagePropertyValue).values(createdValues);
      }

      return {
        delta: {
          dataSource: {
            config: input.config,
            id: existing.id,
            name: input.name,
            updatedAt: nowIso,
          },
          ...(createdProperties.length > 0
            ? {
                properties: createdProperties.map((property) => ({
                  createdAt: nowIso,
                  dataSourceId: existing.id,
                  id: property.databasePropertyId,
                  position: property.position,
                  property: {
                    config: property.config,
                    createdAt: nowIso,
                    deletedAt: null,
                    deletedById: null,
                    id: property.pagePropertyId,
                    name: property.name,
                    type: property.type,
                    updatedAt: nowIso,
                    workspaceId: existing.workspaceId,
                  },
                  propertyId: property.pagePropertyId,
                  updatedAt: nowIso,
                  visible: true,
                  width: null,
                })),
              }
            : {}),
          ...(createdRows.length > 0
            ? {
                rows: createdRows.map((row) => ({
                  createdAt: nowIso,
                  createdById: input.userId,
                  dataSourceId: existing.id,
                  deletedAt: null,
                  deletedById: null,
                  id: row.rowId,
                  lastEditedById: input.userId,
                  page: {
                    createdAt: nowIso,
                    deletedAt: null,
                    id: row.pageId,
                    metadata: row.metadata ?? null,
                    name: row.title,
                    updatedAt: nowIso,
                  },
                  pageId: row.pageId,
                  parentRowId: null,
                  position: row.position,
                  updatedAt: nowIso,
                })),
              }
            : {}),
          ...(createdValues.length > 0
            ? {
                values: createdValues.map((value) => ({
                  ...value,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                })),
              }
            : {}),
        } satisfies DatabaseDelta,
      };
    },
  );

  const payload = await getDatabasePayload(
    existing.parentDatabaseId,
    input.userId,
  );

  if (!payload) {
    throw new Error("Database template was applied but could not be loaded");
  }

  return {
    commit,
    payload,
  };
}
