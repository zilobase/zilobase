import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  databaseProperty,
  databaseRow,
  databaseView,
  databaseDataSource,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { requireDatabaseEditAccess } from "../access/database-access";
import {
  requireDataSourceAccess,
  requireDataSourceEditAccess,
} from "../access/data-source-access";
import { commitDatabaseMutation } from "../core/commit";
import {
  fetchDatabasePropertyDelta,
  fetchDatabaseViewDelta,
} from "../realtime/delta";
import { getNextDatabaseViewName } from "./naming";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { upsertPagePropertyValues } from "../../pages/properties/upsert";

type SubItemRelationRole = "parent-item" | "sub-item";

function getRequestedSubItems(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const subItems = (config as { subItems?: unknown }).subItems;

  return subItems && typeof subItems === "object" && !Array.isArray(subItems)
    ? (subItems as Record<string, unknown>)
    : null;
}

function getSubItemRelationRole(config: unknown): SubItemRelationRole | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const subItems = (config as { subItems?: unknown }).subItems;
  const role =
    subItems && typeof subItems === "object" && !Array.isArray(subItems)
      ? (subItems as { role?: unknown }).role
      : null;

  return role === "parent-item" || role === "sub-item" ? role : null;
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string" && value
      ? [value]
      : [];
}

export async function createDatabaseViewService(input: {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  env?: RuntimeEnv;
  name?: string;
  type?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const type = input.type?.trim() || "table";
  const baseName = input.name?.trim() || "Table";
  const config = input.config ?? null;

  const [sourceLink] = await db
    .select({ dataSourceId: databaseDataSource.dataSourceId })
    .from(databaseDataSource)
    .where(
      and(
        eq(databaseDataSource.databaseId, existing.id),
        eq(databaseDataSource.dataSourceId, input.dataSourceId),
      ),
    )
    .orderBy(asc(databaseDataSource.position))
    .limit(1);

  if (!sourceLink) {
    throw new ServiceMutationError("Data source is not linked", 404);
  }

  await requireDataSourceAccess(sourceLink.dataSourceId, input.userId, "view");

  const existingViews = await db
    .select({ name: databaseView.name, position: databaseView.position })
    .from(databaseView)
    .where(eq(databaseView.databaseId, existing.id))
    .orderBy(asc(databaseView.position));

  const viewId = crypto.randomUUID();
  const nextName = getNextDatabaseViewName(
    baseName,
    new Set(existingViews.map((view) => view.name)),
  );

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const now = new Date();

      await tx.insert(databaseView).values({
        id: viewId,
        databaseId: existing.id,
        dataSourceId: sourceLink.dataSourceId,
        name: nextName,
        type,
        config,
        position: existingViews.length,
        createdAt: now,
        updatedAt: now,
      });

      const delta = await fetchDatabaseViewDelta(viewId, tx);

      return {
        delta: delta ?? { views: [] },
      };
    },
  );

  return {
    commit,
    databaseId: existing.id,
    dataSourceId: sourceLink.dataSourceId,
    name: nextName,
    type,
    viewId,
  };
}

export async function updateDatabaseViewService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name?: string;
  type?: string;
  userId: string;
  viewId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );

  const [existingView] = await db
    .select({ id: databaseView.id, dataSourceId: databaseView.dataSourceId })
    .from(databaseView)
    .where(
      and(
        eq(databaseView.id, input.viewId),
        eq(databaseView.databaseId, existing.id),
      ),
    )
    .limit(1);

  if (!existingView) {
    throw new ServiceMutationError("Database view not found", 404);
  }

  const requestedSubItems = getRequestedSubItems(input.config);
  const needsSubItemProperties = Boolean(
    requestedSubItems?.enabled === true &&
    (typeof requestedSubItems.parentPropertyId !== "string" ||
      typeof requestedSubItems.subItemPropertyId !== "string"),
  );
  let subItemSetup: {
    columns: Array<{
      column: typeof databaseProperty.$inferSelect;
      property: typeof pageProperty.$inferSelect;
    }>;
    parentColumnId: string;
    parentConfig: Record<string, unknown>;
    parentName: string;
    parentPropertyId: string;
    subItemColumnId: string;
    subItemConfig: Record<string, unknown>;
    subItemName: string;
    subItemPropertyId: string;
    values: Array<{
      pageId: string;
      propertyId: string;
      value: string | string[];
    }>;
  } | null = null;
  let effectiveConfig = input.config;

  if (needsSubItemProperties && requestedSubItems) {
    const source = await requireDataSourceEditAccess(
      existingView.dataSourceId,
      input.userId,
    );
    const columns = await db
      .select({ column: databaseProperty, property: pageProperty })
      .from(databaseProperty)
      .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
      .where(
        and(
          eq(databaseProperty.dataSourceId, existingView.dataSourceId),
          isNull(pageProperty.deletedAt),
        ),
      )
      .orderBy(asc(databaseProperty.position));
    const parentColumn = columns.find(
      ({ property }) =>
        getSubItemRelationRole(property.config) === "parent-item",
    );
    const subItemColumn = columns.find(
      ({ property }) => getSubItemRelationRole(property.config) === "sub-item",
    );
    const parentPropertyId = parentColumn?.property.id ?? crypto.randomUUID();
    const subItemPropertyId = subItemColumn?.property.id ?? crypto.randomUUID();
    const parentColumnId = parentColumn?.column.id ?? crypto.randomUUID();
    const subItemColumnId = subItemColumn?.column.id ?? crypto.randomUUID();
    const parentName = parentColumn?.property.name ?? "Parent item";
    const subItemName = subItemColumn?.property.name ?? "Sub-item";
    const relationBase = {
      relatedDatabaseId: source.parentDatabaseId,
      relatedDataSourceId: source.id,
      relatedDatabaseName: source.name,
      relatedPageName: source.name,
      syncStatus: "synced",
      twoWayRelation: true,
    };
    const parentConfig = {
      relation: {
        ...relationBase,
        limit: "one_page",
        relatedPropertyId: subItemPropertyId,
        relatedPropertyName: subItemName,
      },
      subItems: { role: "parent-item" },
    };
    const subItemConfig = {
      relation: {
        ...relationBase,
        limit: "no_limit",
        relatedPropertyId: parentPropertyId,
        relatedPropertyName: parentName,
      },
      subItems: { role: "sub-item" },
    };
    const rows = await db
      .select({
        pageId: databaseRow.pageId,
      })
      .from(databaseRow)
      .where(
        and(
          eq(databaseRow.dataSourceId, existingView.dataSourceId),
          isNull(databaseRow.deletedAt),
        ),
      );
    const existingValues = await db
      .select()
      .from(pagePropertyValue)
      .where(
        inArray(pagePropertyValue.propertyId, [
          parentPropertyId,
          subItemPropertyId,
        ]),
      );
    const validPageIds = new Set(rows.map((row) => row.pageId));
    const parentPageIdsByPageId = new Map<string, Set<string>>();
    const subItemPageIdsByPageId = new Map<string, Set<string>>();

    for (const value of existingValues) {
      const target =
        value.propertyId === parentPropertyId
          ? parentPageIdsByPageId
          : subItemPageIdsByPageId;
      const pageIds = toStringArray(value.value).filter((pageId) =>
        validPageIds.has(pageId),
      );
      target.set(
        value.pageId,
        new Set(
          value.propertyId === parentPropertyId ? pageIds.slice(0, 1) : pageIds,
        ),
      );
    }

    for (const [parentPageId, childPageIds] of subItemPageIdsByPageId) {
      for (const childPageId of childPageIds) {
        if ((parentPageIdsByPageId.get(childPageId)?.size ?? 0) === 0) {
          parentPageIdsByPageId.set(childPageId, new Set([parentPageId]));
        }
      }
    }

    subItemPageIdsByPageId.clear();
    for (const [childPageId, parentPageIds] of parentPageIdsByPageId) {
      const parentPageId = [...parentPageIds][0];
      if (!parentPageId) continue;

      const childPageIds =
        subItemPageIdsByPageId.get(parentPageId) ?? new Set<string>();
      childPageIds.add(childPageId);
      subItemPageIdsByPageId.set(parentPageId, childPageIds);
    }

    const values = [
      ...[...parentPageIdsByPageId].flatMap(([pageId, pageIds]) => {
        const parentPageId = [...pageIds][0];
        return parentPageId
          ? [{ pageId, propertyId: parentPropertyId, value: parentPageId }]
          : [];
      }),
      ...[...subItemPageIdsByPageId].map(([pageId, pageIds]) => ({
        pageId,
        propertyId: subItemPropertyId,
        value: [...pageIds],
      })),
    ];

    subItemSetup = {
      columns,
      parentColumnId,
      parentConfig,
      parentName,
      parentPropertyId,
      subItemColumnId,
      subItemConfig,
      subItemName,
      subItemPropertyId,
      values,
    };
    effectiveConfig = {
      ...(input.config as Record<string, unknown>),
      subItems: {
        ...requestedSubItems,
        parentPropertyId,
        subItemPropertyId,
      },
    };
  }

  const values: Partial<typeof databaseView.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    values.name = input.name;
  }

  if (input.config !== undefined) {
    values.config = effectiveConfig;
  }

  if (input.type !== undefined) {
    values.type = input.type;
  }

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: subItemSetup ? ["views", "properties", "values"] : ["views"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const now = new Date();

      if (subItemSetup) {
        const {
          columns,
          parentColumnId,
          parentConfig,
          parentName,
          parentPropertyId,
          subItemColumnId,
          subItemConfig,
          subItemName,
          subItemPropertyId,
        } = subItemSetup;
        const existingParent = columns.some(
          ({ property }) => property.id === parentPropertyId,
        );
        const existingSubItem = columns.some(
          ({ property }) => property.id === subItemPropertyId,
        );

        if (!existingParent) {
          await tx.insert(pageProperty).values({
            id: parentPropertyId,
            workspaceId: existing.workspaceId,
            name: parentName,
            type: "relation",
            config: parentConfig,
            createdAt: now,
            updatedAt: now,
          });
          await tx.insert(databaseProperty).values({
            id: parentColumnId,
            dataSourceId: existingView.dataSourceId,
            propertyId: parentPropertyId,
            position: columns.length,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await tx
            .update(pageProperty)
            .set({ config: parentConfig, updatedAt: now })
            .where(eq(pageProperty.id, parentPropertyId));
        }

        if (!existingSubItem) {
          await tx.insert(pageProperty).values({
            id: subItemPropertyId,
            workspaceId: existing.workspaceId,
            name: subItemName,
            type: "relation",
            config: subItemConfig,
            createdAt: now,
            updatedAt: now,
          });
          await tx.insert(databaseProperty).values({
            id: subItemColumnId,
            dataSourceId: existingView.dataSourceId,
            propertyId: subItemPropertyId,
            position: columns.length + (existingParent ? 0 : 1),
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await tx
            .update(pageProperty)
            .set({ config: subItemConfig, updatedAt: now })
            .where(eq(pageProperty.id, subItemPropertyId));
        }

        if (subItemSetup.values.length > 0) {
          await upsertPagePropertyValues(
            tx,
            subItemSetup.values.map((value) => ({
              id: crypto.randomUUID(),
              ...value,
              createdAt: now,
              updatedAt: now,
            })),
          );
        }
      }

      await tx
        .update(databaseView)
        .set(values)
        .where(eq(databaseView.id, existingView.id));

      const delta = await fetchDatabaseViewDelta(existingView.id, tx);

      if (subItemSetup) {
        const [parentDelta, subItemDelta] = await Promise.all([
          fetchDatabasePropertyDelta(
            existingView.dataSourceId,
            subItemSetup.parentColumnId,
            tx,
          ),
          fetchDatabasePropertyDelta(
            existingView.dataSourceId,
            subItemSetup.subItemColumnId,
            tx,
          ),
        ]);

        return {
          delta: {
            ...delta,
            properties: [
              ...(parentDelta?.properties ?? []),
              ...(subItemDelta?.properties ?? []),
            ],
            values: subItemSetup.values.map((value) => ({
              ...value,
              updatedAt: now.toISOString(),
            })),
          },
        };
      }

      return {
        delta: delta ?? { views: [] },
      };
    },
  );

  return { commit, databaseId: existing.id, viewId: existingView.id };
}

export async function deleteDatabaseViewService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  userId: string;
  viewId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const views = await db
    .select({ id: databaseView.id })
    .from(databaseView)
    .where(eq(databaseView.databaseId, existing.id));
  const existingView = views.find((view) => view.id === input.viewId);

  if (!existingView) {
    throw new ServiceMutationError("Database view not found", 404);
  }

  if (views.length <= 1) {
    throw new ServiceMutationError(
      "The last view cannot be deleted. A database must always have one view.",
      409,
    );
  }

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx.delete(databaseView).where(eq(databaseView.id, existingView.id));

      return { delta: { removedViewIds: [existingView.id] } };
    },
  );

  return { commit, databaseId: existing.id, viewId: existingView.id };
}
