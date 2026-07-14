import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { canAccessDatabaseInWorkspace, canAccessPage } from "../access";
import type { RuntimeEnv } from "../config";
import { db } from "../db";
import type { Database } from "../db";
import {
  database,
  databaseProperty,
  databaseRow,
  databaseView,
  page,
  pageCollaborationDocument,
  pageProperty,
  pagePropertyValue,
} from "../db/schema";
import type { DatabaseChangedArea } from "./database-delta";
import { upsertPageItemPlacement } from "../page-item-placements";
import { encodePageContentAsYjs } from "../collaboration/service";
import { commitDatabaseMutation } from "./database-commit";
import {
  isReadOnlyPropertyType,
  isSelectLikePropertyType,
  normalizeDatabasePropertyType,
  shouldClearValuesForPropertyTypeChange,
} from "./database-property-types";
import {
  fetchDatabasePropertyDelta,
  fetchDatabaseRowDelta,
  fetchDatabaseViewDelta,
  type DatabaseDelta,
} from "./database-delta";
export class ServiceMutationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceMutationError";
  }
}

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type SqlExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

export const defaultStatusOptions = [
  { color: "gray", group: "To-do", id: "not-started", name: "Not started" },
  {
    color: "blue",
    group: "In progress",
    id: "in-progress",
    name: "In progress",
  },
  { color: "green", group: "Complete", id: "done", name: "Done" },
] as const;

export const selectOptionColors = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

type PropertySelectOption = {
  color?: string;
  group?: string;
  id: string;
  name: string;
};

type StatusOption = { id: string; name: string };
type StatusPropertyConfig = { defaultOptionId?: unknown; options?: unknown };

export const isDatabaseHostPageId = (
  candidatePageId: unknown,
  databasePageId: string | null,
) =>
  typeof candidatePageId === "string" &&
  candidatePageId.length > 0 &&
  candidatePageId === databasePageId;

const statusOptionAliases: Record<string, string> = {
  complete: "done",
  completed: "done",
  done: "done",
  "in progress": "in-progress",
  inprogress: "in-progress",
  "not started": "not-started",
  "to-do": "not-started",
  todo: "not-started",
};

const normalizeOptionKey = (value: string) =>
  value.trim().toLowerCase().replace(/[_-]+/g, " ");

const getNextSelectOptionColor = (index: number) =>
  selectOptionColors[index % selectOptionColors.length] ?? "gray";

const resolveDefaultStatusOption = (
  id: string,
  name: string,
): (typeof defaultStatusOptions)[number] | null => {
  const byId = defaultStatusOptions.find((option) => option.id === id);
  if (byId) {
    return byId;
  }

  const aliasId =
    statusOptionAliases[normalizeOptionKey(id)] ??
    statusOptionAliases[normalizeOptionKey(name)];

  if (aliasId) {
    return defaultStatusOptions.find((option) => option.id === aliasId) ?? null;
  }

  return (
    defaultStatusOptions.find(
      (option) => normalizeOptionKey(option.name) === normalizeOptionKey(name),
    ) ?? null
  );
};

const normalizeSelectOption = (
  option: unknown,
  index: number,
  type: "select" | "multi_select" | "status",
): PropertySelectOption | null => {
  if (!option || typeof option !== "object") {
    return null;
  }

  const raw = option as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";

  if (!id || !name) {
    return null;
  }

  if (type === "status") {
    const defaultOption = resolveDefaultStatusOption(id, name);

    if (defaultOption) {
      return {
        id: defaultOption.id,
        name: defaultOption.name,
        color:
          typeof raw.color === "string" && raw.color.trim()
            ? raw.color.trim()
            : defaultOption.color,
        group:
          typeof raw.group === "string" && raw.group.trim()
            ? raw.group.trim()
            : defaultOption.group,
      };
    }

    return {
      id,
      name,
      color:
        typeof raw.color === "string" && raw.color.trim()
          ? raw.color.trim()
          : getNextSelectOptionColor(index),
      group:
        typeof raw.group === "string" && raw.group.trim()
          ? raw.group.trim()
          : "To-do",
    };
  }

  return {
    id,
    name,
    color:
      typeof raw.color === "string" && raw.color.trim()
        ? raw.color.trim()
        : getNextSelectOptionColor(index),
  };
};

export function normalizePropertyConfig(type: string, config: unknown) {
  const normalizedType = normalizeDatabasePropertyType(type);

  if (!normalizedType) {
    throw new ServiceMutationError("Unsupported property type", 400);
  }

  if (normalizedType === "status") {
    const baseConfig =
      config && typeof config === "object"
        ? { ...(config as Record<string, unknown>) }
        : {};
    const rawOptions = baseConfig.options;

    if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
      return {
        ...baseConfig,
        defaultOptionId:
          typeof baseConfig.defaultOptionId === "string"
            ? baseConfig.defaultOptionId
            : defaultStatusOptions[0]?.id,
        options: [...defaultStatusOptions],
      };
    }

    const options = rawOptions
      .map((option, index) => normalizeSelectOption(option, index, "status"))
      .filter((option): option is PropertySelectOption => option !== null);

    return {
      ...baseConfig,
      defaultOptionId:
        typeof baseConfig.defaultOptionId === "string"
          ? baseConfig.defaultOptionId
          : (options[0]?.id ?? defaultStatusOptions[0]?.id),
      options,
    };
  }

  if (
    (normalizedType === "select" || normalizedType === "multi_select") &&
    config &&
    typeof config === "object" &&
    "options" in config &&
    Array.isArray((config as { options?: unknown }).options)
  ) {
    const options = (config as { options: unknown[] }).options
      .map((option, index) =>
        normalizeSelectOption(option, index, normalizedType),
      )
      .filter((option): option is PropertySelectOption => option !== null);

    return {
      ...(config as Record<string, unknown>),
      options,
    };
  }

  return config;
}

export function formatDatePropertyValueAsText(value: unknown) {
  let start: unknown;
  let end: unknown;

  if (Array.isArray(value)) {
    [start, end] = value;
  } else if (value && typeof value === "object") {
    const dateValue = value as {
      date?: unknown;
      end?: unknown;
      start?: unknown;
    };
    start = dateValue.start ?? dateValue.date;
    end = dateValue.end;
  } else {
    start = value;
  }

  const startText = typeof start === "string" ? start.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";

  if (startText && endText) {
    return `${startText} - ${endText}`;
  }

  return startText || null;
}

const getPositionValuesSql = (ids: string[]) =>
  sql.join(
    ids.map((id, position) => sql`(${id}::text, ${position}::integer)`),
    sql`, `,
  );

const getStatusOptions = (config: unknown) => {
  const options =
    config && typeof config === "object" && "options" in config
      ? (config as StatusPropertyConfig).options
      : null;

  if (!Array.isArray(options)) {
    return defaultStatusOptions;
  }

  const validOptions = options.filter(
    (option): option is StatusOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof (option as StatusOption).id === "string" &&
      typeof (option as StatusOption).name === "string",
  );

  return validOptions.length > 0 ? validOptions : defaultStatusOptions;
};

const getStatusDefaultValue = (config: unknown) => {
  const options = getStatusOptions(config);
  const defaultOptionId =
    config && typeof config === "object" && "defaultOptionId" in config
      ? (config as StatusPropertyConfig).defaultOptionId
      : defaultStatusOptions[0]?.id;

  if (typeof defaultOptionId === "string") {
    const defaultOption = options.find(
      (option) => option.id === defaultOptionId,
    );
    if (defaultOption) {
      return defaultOption.name;
    }
  }

  return options[0]?.name ?? null;
};

const getNextDatabaseViewName = (
  baseName: string,
  existingNames: Set<string>,
) => {
  const trimmedName = baseName.trim() || "Table";

  if (!existingNames.has(trimmedName)) {
    return trimmedName;
  }

  let index = 2;
  while (existingNames.has(`${trimmedName} ${index}`)) {
    index += 1;
  }

  return `${trimmedName} ${index}`;
};

export const getDatabaseRecord = async (id: string) => {
  const [record] = await db
    .select()
    .from(database)
    .where(and(eq(database.id, id), isNull(database.deletedAt)))
    .limit(1);

  return record;
};

async function requireDatabaseEditAccess(databaseId: string, userId: string) {
  const record = await getDatabaseRecord(databaseId);

  if (!record) {
    throw new ServiceMutationError("Database not found", 404);
  }

  if (
    !(await canAccessDatabaseInWorkspace(
      record.id,
      record.workspaceId,
      userId,
      "edit",
    ))
  ) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return record;
}

export async function createDatabaseService(input: {
  name?: string;
  workspaceId: string;
  pageId: string;
  standalone?: boolean;
  userId: string;
}) {
  const name = input.name?.trim() || "New database";

  const [pageRecord] = await db
    .select({ id: page.id })
    .from(page)
    .where(
      and(
        eq(page.id, input.pageId),
        eq(page.workspaceId, input.workspaceId),
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

  const databaseId = crypto.randomUUID();
  const defaultViewId = crypto.randomUUID();
  const parentPlacementId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(database).values({
      id: databaseId,
      workspaceId: input.workspaceId,
      createdById: input.userId,
      pageId: input.pageId,
      name,
      config: {},
    });
    await tx.insert(databaseView).values({
      id: defaultViewId,
      databaseId,
      type: "table",
      name: "Table",
      position: 0,
    });
    await upsertPageItemPlacement(tx, {
      id: parentPlacementId,
      workspaceId: input.workspaceId,
      parentKind: "page",
      parentId: input.pageId,
      itemKind: "database",
      itemId: databaseId,
      placementKind: "primary",
    });
  });

  return {
    databaseId,
    defaultViewId,
    name,
    pageId: input.pageId,
  };
}

export async function updateDatabaseService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;

  name?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const values: Partial<typeof database.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    values.name = input.name;
  }

  if (input.config !== undefined) {
    values.config = input.config;
  }

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["database"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx.update(database).set(values).where(eq(database.id, existing.id));

      return {
        delta: {
          database: {
            id: existing.id,
            ...values,
          },
        } satisfies DatabaseDelta,
      };
    },
  );

  return { databaseId: existing.id };
}

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

export async function createDatabaseViewService(input: {
  config?: unknown;
  databaseId: string;
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

  await commitDatabaseMutation(
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

  return { databaseId: existing.id, name: nextName, type, viewId };
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
    .select({ id: databaseView.id })
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

  const values: Partial<typeof databaseView.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    values.name = input.name;
  }

  if (input.config !== undefined) {
    values.config = input.config;
  }

  if (input.type !== undefined) {
    values.type = input.type;
  }

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx
        .update(databaseView)
        .set(values)
        .where(eq(databaseView.id, existingView.id));

      const delta = await fetchDatabaseViewDelta(existingView.id, tx);

      return {
        delta: delta ?? { views: [] },
      };
    },
  );

  return { databaseId: existing.id, viewId: existingView.id };
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

function readSelectOptionNames(config: unknown): Set<string> {
  if (!config || typeof config !== "object" || !("options" in config)) {
    return new Set();
  }

  const options = (config as { options?: unknown }).options;

  if (!Array.isArray(options)) {
    return new Set();
  }

  return new Set(
    options.flatMap((option) => {
      if (!option || typeof option !== "object") {
        return [];
      }

      const name = (option as { name?: unknown }).name;
      return typeof name === "string" && name.length > 0 ? [name] : [];
    }),
  );
}

export function validateCellValue(
  propertyType: string,
  config: unknown,
  value: unknown,
) {
  const normalizedType = normalizeDatabasePropertyType(propertyType, "");

  if (!normalizedType) {
    throw new ServiceMutationError("Unsupported property type", 400);
  }

  if (isReadOnlyPropertyType(normalizedType)) {
    throw new ServiceMutationError("This property is read-only", 400);
  }

  if (isSelectLikePropertyType(normalizedType)) {
    const optionNames = readSelectOptionNames(config);

    if (normalizedType === "multi_select") {
      if (!Array.isArray(value)) {
        throw new ServiceMutationError(
          "multi_select values must be an array of option names.",
          400,
        );
      }

      for (const item of value) {
        if (typeof item !== "string" || !optionNames.has(item)) {
          throw new ServiceMutationError(
            `Invalid multi_select option. Configure options on the property first. Known options: ${[...optionNames].join(", ") || "(none)"}`,
            400,
          );
        }
      }

      return;
    }

    if (typeof value !== "string" || !optionNames.has(value)) {
      throw new ServiceMutationError(
        `Invalid select/status option name. Configure options on the property first. Known options: ${[...optionNames].join(", ") || "(none)"}`,
        400,
      );
    }
  }
}

export async function setDatabaseCellValueService(input: {
  databaseId: string;
  env?: RuntimeEnv;

  rowId: string;
  userId: string;
  value: unknown;
  pagePropertyId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );

  const [row] = await db
    .select({ id: databaseRow.id, pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.id, input.rowId),
        eq(databaseRow.databaseId, existing.id),
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
        eq(databaseProperty.databaseId, existing.id),
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

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["values"],
      databaseId: existing.id,
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
    databaseId: existing.id,
    rowId: row.id,
    rowPageId: row.pageId,
    pagePropertyId: input.pagePropertyId,
  };
}
