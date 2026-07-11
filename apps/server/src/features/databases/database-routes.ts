import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  canAccessPageInWorkspace,
  getAccessiblePageIds,
  isPagePublishedInWorkspace,
} from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import { db } from "../../db";
import type { Database } from "../../db";
import {
  database,
  databaseProperty,
  databaseRow,
  databaseView,
  favorite,
  page,
  pageItemPlacement,
  pageProperty,
  pagePropertyValue,
} from "../../db/schema";
import type { DatabaseChangedArea } from "../../services/database-delta";
import type { AppBindings } from "../../types";
import { withDatabaseParentItemId } from "../../item-relationships";
import { upsertPageItemPlacement } from "../../page-item-placements";
import { softDeleteDatabaseTree } from "../../soft-delete-nav-items";
import { loadWorkspacePageGraph } from "../../page-graph";
import {
  commitDatabaseMutation as commitDatabaseMutationCore,
  DatabaseMutationError,
  mutationResponse,
  type SqlExecutor,
} from "../../services/database-commit";
import {
  normalizePropertyConfig,
  ServiceMutationError,
  validateCellValue,
} from "../../services/database-mutations";
import {
  isReadOnlyPropertyType,
  isSelectLikePropertyType,
  normalizeDatabasePropertyType,
} from "../../services/database-property-types";
import {
  fetchDatabasePropertyDelta,
  fetchDatabaseViewDelta,
  propertyPositionDelta,
  rowPositionDelta,
  type DatabaseDelta,
} from "../../services/database-delta";

export const databaseRoutes = new Hono<AppBindings>();

const requireUser = (c: Context<AppBindings>) => c.get("user") ?? null;

const defaultStatusOptions = [
  {
    color: "gray",
    group: "To-do",
    id: "not-started",
    name: "Not started",
  },
  {
    color: "blue",
    group: "In progress",
    id: "in-progress",
    name: "In progress",
  },
  {
    color: "green",
    group: "Complete",
    id: "done",
    name: "Done",
  },
];

const getDatabaseRecord = async (id: string) => {
  const [record] = await db
    .select()
    .from(database)
    .where(and(eq(database.id, id), isNull(database.deletedAt)))
    .limit(1);

  return record;
};

const getNestedDatabasePageIds = async (
  rootDatabaseId: string,
  workspaceId: string,
  accessibleIds: Set<string>,
) => {
  const graph = await loadWorkspacePageGraph(workspaceId);

  return graph.getNestedDatabasePageIds(rootDatabaseId, accessibleIds);
};

type StatusOption = {
  id: string;
  name: string;
};

type StatusPropertyConfig = {
  defaultOptionId?: unknown;
  options?: unknown;
};

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const databaseMutationErrorResponse = (
  c: Context<AppBindings>,
  error: DatabaseMutationError,
) => c.json({ error: error.message }, error.status === 404 ? 404 : 400);

const hasDuplicateValues = (values: string[]) =>
  new Set(values).size !== values.length;

const getPositionValuesSql = (ids: string[]) =>
  sql.join(
    ids.map((id, position) => sql`(${id}::text, ${position}::integer)`),
    sql`, `,
  );

const commitDatabaseMutation = async (
  c: Context<AppBindings>,
  options: {
    actorId: string;
    changed: DatabaseChangedArea[];
    databaseId: string;
  },
  mutate: (tx: DatabaseTransaction) => Promise<{ delta: DatabaseDelta }>,
) => {
  try {
    const committed = await commitDatabaseMutationCore(options, mutate);

    return { ok: true as const, ...committed };
  } catch (error) {
    if (error instanceof DatabaseMutationError) {
      return { ok: false as const, error };
    }

    throw error;
  }
};

const updateDatabasePropertyPositions = async (
  executor: SqlExecutor,
  databaseId: string,
  propertyIds: string[],
  updatedAt: Date,
) => {
  if (propertyIds.length === 0) {
    return;
  }

  await executor.execute(sql`
    update ${databaseProperty}
    set "position" = positions.position,
        "updated_at" = ${updatedAt}
    from (values ${getPositionValuesSql(propertyIds)}) as positions(id, position)
    where ${databaseProperty.id} = positions.id
      and ${databaseProperty.databaseId} = ${databaseId}
      and ${databaseProperty.position} <> positions.position
  `);
};

const updateDatabaseRowPositions = async (
  executor: SqlExecutor,
  databaseId: string,
  rowIds: string[],
  updatedAt: Date,
) => {
  if (rowIds.length === 0) {
    return;
  }

  await executor.execute(sql`
    update ${databaseRow}
    set "position" = positions.position,
        "updated_at" = ${updatedAt}
    from (values ${getPositionValuesSql(rowIds)}) as positions(id, position)
    where ${databaseRow.id} = positions.id
      and ${databaseRow.databaseId} = ${databaseId}
      and ${databaseRow.position} <> positions.position
  `);
};

const updateDatabaseRowPlacementPositions = async (
  executor: SqlExecutor,
  databaseId: string,
  rowIds: string[],
  updatedAt: Date,
) => {
  if (rowIds.length === 0) {
    return;
  }

  await executor.execute(sql`
    update ${pageItemPlacement}
    set "position" = positions.position,
        "updated_at" = ${updatedAt}
    from (values ${getPositionValuesSql(rowIds)}) as positions(id, position)
    where ${pageItemPlacement.sourceRowId} = positions.id
      and ${pageItemPlacement.parentKind} = 'database'
      and ${pageItemPlacement.parentId} = ${databaseId}
      and ${pageItemPlacement.placementKind} = 'database_row'
      and ${pageItemPlacement.deletedAt} is null
      and ${pageItemPlacement.position} <> positions.position
  `);
};

const incrementDatabaseRowPlacementPositions = async (
  executor: SqlExecutor,
  databaseId: string,
  fromPosition: number,
  updatedAt: Date,
) => {
  await executor.execute(sql`
    update ${pageItemPlacement}
    set "position" = ${pageItemPlacement.position} + 1,
        "updated_at" = ${updatedAt}
    where ${pageItemPlacement.parentKind} = 'database'
      and ${pageItemPlacement.parentId} = ${databaseId}
      and ${pageItemPlacement.placementKind} = 'database_row'
      and ${pageItemPlacement.deletedAt} is null
      and ${pageItemPlacement.position} >= ${fromPosition}
  `);
};

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
    const defaultOption = options.find((option) => option.id === defaultOptionId);

    if (defaultOption) {
      return defaultOption.name;
    }
  }

  return options[0]?.name ?? null;
};

const getPropertyNameKey = (name: string) => name.trim().toLowerCase();

const readPropertyOptions = (
  type: string,
  config: unknown,
): Record<string, unknown>[] => {
  const rawOptions =
    config && typeof config === "object" && "options" in config
      ? (config as { options?: unknown }).options
      : null;
  const options = Array.isArray(rawOptions)
    ? rawOptions.filter(
        (option): option is Record<string, unknown> =>
          Boolean(option) &&
          typeof option === "object" &&
          typeof (option as { id?: unknown }).id === "string" &&
          typeof (option as { name?: unknown }).name === "string",
      )
    : [];

  return type === "status" && options.length === 0
    ? defaultStatusOptions.map((option) => ({ ...option }))
    : options.map((option) => ({ ...option }));
};

const getOptionValueNames = (propertyType: string, value: unknown) => {
  if (propertyType === "multi_select") {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
      : typeof value === "string" && value.length > 0
        ? [value]
        : [];
  }

  if (propertyType === "select" || propertyType === "status") {
    const optionName = Array.isArray(value) ? value[0] : value;

    return typeof optionName === "string" && optionName.length > 0
      ? [optionName]
      : [];
  }

  return [];
};

const getOptionId = (name: string, existingIds: Set<string>) => {
  const baseId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "option";
  let id = baseId;
  let index = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }

  existingIds.add(id);
  return id;
};

const normalizeValueForPropertyType = (propertyType: string, value: unknown) => {
  if (propertyType === "multi_select" && typeof value === "string") {
    return [value];
  }

  if (
    (propertyType === "select" || propertyType === "status") &&
    Array.isArray(value)
  ) {
    return value[0] ?? null;
  }

  return value;
};

const mergeSelectOptionsForValue = (
  propertyType: string,
  config: unknown,
  value: unknown,
) => {
  if (!isSelectLikePropertyType(propertyType)) {
    return { changed: false, config };
  }

  const optionNames = getOptionValueNames(propertyType, value);

  if (optionNames.length === 0) {
    return { changed: false, config };
  }

  const options = readPropertyOptions(propertyType, config);
  const existingNames = new Set(
    options.map((option) => String(option.name).trim().toLowerCase()),
  );
  const existingIds = new Set(options.map((option) => String(option.id)));
  let changed = false;

  for (const name of optionNames) {
    const key = name.trim().toLowerCase();

    if (existingNames.has(key)) {
      continue;
    }

    options.push({ id: getOptionId(name, existingIds), name });
    existingNames.add(key);
    changed = true;
  }

  if (!changed) {
    return { changed: false, config };
  }

  const baseConfig =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};

  return {
    changed: true,
    config: normalizePropertyConfig(propertyType, {
      ...baseConfig,
      options,
    }),
  };
};

const getDuplicatePropertyName = (
  name: string,
  existingNames: Set<string>,
) => {
  const trimmedName = name.trim() || "Property";
  const baseName = `${trimmedName} copy`;

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let index = 2;

  while (existingNames.has(`${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
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

const getDatabasePayload = async (
  id: string,
  userId?: string,
  existingRecord?: NonNullable<Awaited<ReturnType<typeof getDatabaseRecord>>>,
) => {
  const record = existingRecord ?? await getDatabaseRecord(id);

  if (!record) {
    return null;
  }

  const [properties, views, rows, favoriteRecords] = await Promise.all([
    db
      .select({
        column: databaseProperty,
        property: pageProperty,
      })
      .from(databaseProperty)
      .innerJoin(
        pageProperty,
        eq(databaseProperty.propertyId, pageProperty.id),
      )
      .where(
        and(
          eq(databaseProperty.databaseId, id),
          isNull(pageProperty.deletedAt),
        ),
      )
      .orderBy(asc(databaseProperty.position)),
    db
      .select()
      .from(databaseView)
      .where(eq(databaseView.databaseId, id))
      .orderBy(asc(databaseView.position)),
    db
      .select({
        row: databaseRow,
        page: {
          createdAt: page.createdAt,
          deletedAt: page.deletedAt,
          id: page.id,
          name: page.name,
          metadata: page.metadata,
          updatedAt: page.updatedAt,
        },
      })
      .from(databaseRow)
      .innerJoin(page, eq(databaseRow.pageId, page.id))
      .where(
        and(
          eq(databaseRow.databaseId, id),
          isNull(databaseRow.deletedAt),
        ),
      )
      .orderBy(asc(databaseRow.position)),
    userId
      ? db
          .select({ id: favorite.id })
          .from(favorite)
          .where(and(eq(favorite.userId, userId), eq(favorite.databaseId, id)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const pageIds = rows.map(({ row }) => row.pageId);
  const propertyIds = properties.map(({ property }) => property.id);
  const values =
    pageIds.length > 0 && propertyIds.length > 0
      ? await db
          .select()
          .from(pagePropertyValue)
          .where(
            and(
              inArray(pagePropertyValue.pageId, pageIds),
              inArray(pagePropertyValue.propertyId, propertyIds),
            ),
          )
      : [];
  const [favoriteRecord] = favoriteRecords;

  return {
    database: { ...record, isFavorite: Boolean(favoriteRecord) },
    properties: properties.map(({ column, property }) => ({
      ...column,
      property,
    })),
    views,
    rows: rows.map(({ row, page }) => ({
      ...row,
      page,
    })),
    values,
  };
};

const getDatabaseSchemaPayload = async (
  id: string,
  userId?: string,
  existingRecord?: NonNullable<Awaited<ReturnType<typeof getDatabaseRecord>>>,
) => {
  const record = existingRecord ?? (await getDatabaseRecord(id));

  if (!record) {
    return null;
  }

  const [properties, views, favoriteRecords] = await Promise.all([
    db
      .select({
        column: databaseProperty,
        property: pageProperty,
      })
      .from(databaseProperty)
      .innerJoin(
        pageProperty,
        eq(databaseProperty.propertyId, pageProperty.id),
      )
      .where(
        and(
          eq(databaseProperty.databaseId, id),
          isNull(pageProperty.deletedAt),
        ),
      )
      .orderBy(asc(databaseProperty.position)),
    db
      .select()
      .from(databaseView)
      .where(eq(databaseView.databaseId, id))
      .orderBy(asc(databaseView.position)),
    userId
      ? db
          .select({ id: favorite.id })
          .from(favorite)
          .where(and(eq(favorite.userId, userId), eq(favorite.databaseId, id)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const [favoriteRecord] = favoriteRecords;

  return {
    database: { ...record, isFavorite: Boolean(favoriteRecord) },
    properties: properties.map(({ column, property }) => ({
      ...column,
      property,
    })),
    views,
    rows: [],
    values: [],
  };
};

databaseRoutes.post("/", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const {
    workspaceId,
    pageId,
    name = "New database",
    standalone = false,
  } = body as {
    workspaceId?: unknown;
    pageId?: unknown;
    name?: unknown;
    standalone?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (typeof pageId !== "string" || pageId.length === 0) {
    return c.json({ error: "pageId is required" }, 400);
  }

  if (typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  const [pageRecord] = await db
    .select({ id: page.id })
    .from(page)
    .where(
      and(
        eq(page.id, pageId),
        eq(page.workspaceId, workspaceId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);

  if (!pageRecord) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(pageRecord.id, workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const databaseId = crypto.randomUUID();
  const [parentFavorite] = await db
    .select({ id: favorite.id })
    .from(favorite)
    .where(and(eq(favorite.userId, user.id), eq(favorite.pageId, pageId)))
    .limit(1);
  const shouldInheritFavorite = Boolean(parentFavorite);

  await db.transaction(async (tx) => {
    await tx.insert(database).values({
      id: databaseId,
      workspaceId,
      pageId,
      name,
      config: standalone === true ? {} : withDatabaseParentItemId(null, pageId),
    });
    await tx.insert(databaseView).values({
      id: crypto.randomUUID(),
      databaseId,
      type: "table",
      name: "Table",
      position: 0,
    });
    if (shouldInheritFavorite) {
      await tx
        .insert(favorite)
        .values({
          databaseId,
          id: crypto.randomUUID(),
          userId: user.id,
        })
        .onConflictDoNothing({
          target: [favorite.userId, favorite.databaseId],
        });
    }
  });

  const payload = await getDatabasePayload(databaseId, user.id);

  if (!payload) {
    return c.json({ error: "Database not found" }, 404);
  }

  const parentPlacement =
    standalone === true
      ? null
      : {
          id: `legacy:primary:page:${pageId}:database:${databaseId}:`,
          workspaceId,
          parentKind: "page" as const,
          parentId: pageId,
          itemKind: "database" as const,
          itemId: databaseId,
          placementKind: "primary" as const,
          sourceRowId: null,
          position: 0,
        };

  return c.json(
    {
      ...payload,
      navDelta: {
        upsertDatabases: [
          {
            ...payload.database,
            views: payload.views,
          },
        ],
        upsertPlacements: parentPlacement ? [parentPlacement] : [],
      },
    },
    201,
  );
});



databaseRoutes.get("/:id", async (c) => {
  const user = requireUser(c);
  const record = await getDatabaseRecord(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Database not found" }, 404);
  }

  const canView = user
    ? await canAccessPageInWorkspace(
        record.pageId,
        record.workspaceId,
        user.id,
        "view",
      )
    : false;

  if (!canView) {
    const published = await isPagePublishedInWorkspace(
      record.pageId,
      record.workspaceId,
    );

    if (!published) {
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const schemaOnly = c.req.query("schemaOnly") === "1";
  const payload = schemaOnly
    ? await getDatabaseSchemaPayload(record.id, user?.id, record)
    : await getDatabasePayload(record.id, user?.id, record);

  return c.json(payload);
});

databaseRoutes.get("/:id/published", async (c) => {
  const record = await getDatabaseRecord(c.req.param("id"));

  if (!record) {
    return c.json({ published: false }, 404);
  }

  return c.json({
    published: await isPagePublishedInWorkspace(
      record.pageId,
      record.workspaceId,
    ),
  });
});

databaseRoutes.put("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .insert(favorite)
    .values({
      databaseId: existing.id,
      id: crypto.randomUUID(),
      userId: user.id,
    })
    .onConflictDoNothing({
      target: [favorite.userId, favorite.databaseId],
    });

  const payload = await getDatabasePayload(existing.id, user.id, existing);

  return c.json(payload);
});

databaseRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "full"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { deletedDatabaseIds, deletedPageIds } =
    await softDeleteDatabaseTree({
      databaseId: existing.id,
      workspaceId: existing.workspaceId,
      userId: user.id,
    });

  const [record] = await db
    .select()
    .from(database)
    .where(eq(database.id, existing.id))
    .limit(1);

  return c.json({
    database: record,
    deletedDatabaseIds,
    deletedPageIds,
  });
});

databaseRoutes.delete("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .delete(favorite)
    .where(and(eq(favorite.userId, user.id), eq(favorite.databaseId, existing.id)));

  const payload = await getDatabasePayload(existing.id, user.id, existing);

  return c.json(payload);
});

databaseRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }


  const patch = body as { name?: unknown; config?: unknown };
  const values: Partial<typeof database.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      return c.json({ error: "name must be a string" }, 400);
    }

    values.name = patch.name;
  }

  if (patch.config !== undefined) {
    values.config = patch.config;
  }

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["database"],

      databaseId: existing.id,
    },
    async (tx) => {
      await tx.update(database).set(values).where(eq(database.id, existing.id));

      return {
        delta: {
          database: {
            id: existing.id,
            ...values,
          },
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.patch("/:id/views/:viewId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [existingView] = await db
    .select({ id: databaseView.id })
    .from(databaseView)
    .where(
      and(
        eq(databaseView.id, c.req.param("viewId")),
        eq(databaseView.databaseId, existing.id),
      ),
    )
    .limit(1);

  if (!existingView) {
    return c.json({ error: "Database view not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }


  const patch = body as { name?: unknown; config?: unknown; type?: unknown };
  const values: Partial<typeof databaseView.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      return c.json({ error: "name must be a string" }, 400);
    }

    values.name = patch.name;
  }

  if (patch.config !== undefined) {
    values.config = patch.config;
  }

  if (patch.type !== undefined) {
    if (typeof patch.type !== "string") {
      return c.json({ error: "type must be a string" }, 400);
    }

    values.type = patch.type;
  }

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["views"],

      databaseId: existing.id,
    },
    async (tx) => {
      await tx
        .update(databaseView)
        .set(values)
        .where(eq(databaseView.id, existingView.id));

      const delta = await fetchDatabaseViewDelta(existingView.id);

      return {
        delta: delta ?? {
          views: [
            {
              ...values,
              databaseId: existing.id,
              id: existingView.id,
            },
          ],
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.post("/:id/views", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));

  const {
    config = null,
    name = "Table",
    type = "table",
  } = body as {
    config?: unknown;
    name?: unknown;
    type?: unknown;
  };

  if (typeof name !== "string" || typeof type !== "string") {
    return c.json({ error: "name and type must be strings" }, 400);
  }

  const existingViews = await db
    .select({
      name: databaseView.name,
      position: databaseView.position,
    })
    .from(databaseView)
    .where(eq(databaseView.databaseId, existing.id))
    .orderBy(asc(databaseView.position));
  const nextPosition = existingViews.length;
  const nextName = getNextDatabaseViewName(
    name,
    new Set(existingViews.map((view) => view.name)),
  );

  const viewId = crypto.randomUUID();
  const now = new Date();

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["views"],

      databaseId: existing.id,
    },
    async (tx) => {
      await tx.insert(databaseView).values({
        id: viewId,
        databaseId: existing.id,
        name: nextName,
        type,
        config,
        position: nextPosition,
        createdAt: now,
        updatedAt: now,
      });

      const delta = await fetchDatabaseViewDelta(viewId);

      return {
        delta: delta ?? {
          views: [
            {
              config,
              createdAt: now.toISOString(),
              databaseId: existing.id,
              id: viewId,
              name: nextName,
              position: nextPosition,
              type,
              updatedAt: now.toISOString(),
            },
          ],
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation), 201);
});

databaseRoutes.delete("/:id/views/:viewId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [existingView] = await db
    .select({ id: databaseView.id })
    .from(databaseView)
    .where(
      and(
        eq(databaseView.id, c.req.param("viewId")),
        eq(databaseView.databaseId, existing.id),
      ),
    )
    .limit(1);

  if (!existingView) {
    return c.json({ error: "Database view not found" }, 404);
  }

  const remainingViews = await db
    .select({ id: databaseView.id })
    .from(databaseView)
    .where(eq(databaseView.databaseId, existing.id));

  if (remainingViews.length <= 1) {
    return c.json({ error: "A database must have at least one view" }, 400);
  }

  const body = await c.req.json().catch(() => null);


  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["views"],

      databaseId: existing.id,
    },
    async (tx) => {
      await tx.delete(databaseView).where(eq(databaseView.id, existingView.id));

      return {
        delta: {
          removedViewIds: [existingView.id],
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.post("/:id/properties", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));

  const { name = "Property", type = "text", config = null, position } = body as {
    name?: unknown;
    type?: unknown;
    config?: unknown;
    position?: unknown;
  };

  if (typeof name !== "string" || typeof type !== "string") {
    return c.json({ error: "name and type must be strings" }, 400);
  }

  const normalizedType = normalizeDatabasePropertyType(type);

  if (!normalizedType) {
    return c.json({ error: "Unsupported property type" }, 400);
  }

  const normalizedConfig = normalizePropertyConfig(normalizedType, config);

  if (
    position !== undefined &&
    (!Number.isInteger(position) || (position as number) < 0)
  ) {
    return c.json({ error: "position must be a non-negative integer" }, 400);
  }

  const columns = await db
    .select({ position: databaseProperty.position })
    .from(databaseProperty)
    .where(eq(databaseProperty.databaseId, existing.id));
  const propertyId = crypto.randomUUID();
  const columnId = crypto.randomUUID();
  const targetPosition =
    position === undefined ? columns.length : Math.min(position as number, columns.length);
  const now = new Date();

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["properties"],

      databaseId: existing.id,
    },
    async (tx) => {
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
        id: propertyId,
        workspaceId: existing.workspaceId,
        name,
        type: normalizedType,
        config: normalizedConfig,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(databaseProperty).values({
        id: columnId,
        databaseId: existing.id,
        propertyId,
        position: targetPosition,
        createdAt: now,
        updatedAt: now,
      });

      const delta = await fetchDatabasePropertyDelta(existing.id, columnId);

      return {
        delta: delta ?? {
          properties: [
            {
              createdAt: now.toISOString(),
              databaseId: existing.id,
              id: columnId,
              position: targetPosition,
              property: {
                config: normalizedConfig,
                createdAt: now.toISOString(),
                id: propertyId,
                name,
                workspaceId: existing.workspaceId,
                type,
                updatedAt: now.toISOString(),
              },
              propertyId,
              updatedAt: now.toISOString(),
              visible: true,
            },
          ],
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation), 201);
});

databaseRoutes.patch("/:id/properties/reorder", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }


  const { propertyIds } = body as { propertyIds?: unknown };

  if (
    !Array.isArray(propertyIds) ||
    propertyIds.some((propertyId) => typeof propertyId !== "string")
  ) {
    return c.json({ error: "propertyIds must be an array of strings" }, 400);
  }

  const nextPropertyIds = propertyIds as string[];

  if (hasDuplicateValues(nextPropertyIds)) {
    return c.json({ error: "propertyIds must not contain duplicates" }, 400);
  }

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["properties"],

      databaseId: existing.id,
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
      nextPropertyIds.length !== existingPropertyIds.size ||
      nextPropertyIds.some((propertyId) => !existingPropertyIds.has(propertyId))
    ) {
      throw new DatabaseMutationError(
        "propertyIds must include every active database property",
      );
    }

    await updateDatabasePropertyPositions(
      tx,
      existing.id,
      nextPropertyIds,
      new Date(),
    );

      return {
        delta: propertyPositionDelta(nextPropertyIds),
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.patch("/:id/properties/:databasePropertyId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const [column] = await db
    .select()
    .from(databaseProperty)
    .where(
      and(
        eq(databaseProperty.id, c.req.param("databasePropertyId")),
        eq(databaseProperty.databaseId, existing.id),
      ),
    )
    .limit(1);

  if (!column) {
    return c.json({ error: "Property not found" }, 404);
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
    return c.json({ error: "Property not found" }, 404);
  }


  const patch = body as {
    config?: unknown;
    name?: unknown;
    position?: unknown;
    type?: unknown;
  };
  const columnValues: Partial<typeof databaseProperty.$inferInsert> = {
    updatedAt: new Date(),
  };
  const propertyValues: Partial<typeof pageProperty.$inferInsert> = {
    updatedAt: new Date(),
  };
  const normalizedPatchType =
    patch.type === undefined
      ? undefined
      : normalizeDatabasePropertyType(patch.type);

  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      return c.json({ error: "name must be a string" }, 400);
    }

    propertyValues.name = patch.name;
  }

  if (patch.type !== undefined) {
    if (typeof patch.type !== "string") {
      return c.json({ error: "type must be a string" }, 400);
    }

    if (!normalizedPatchType) {
      return c.json({ error: "Unsupported property type" }, 400);
    }

    propertyValues.type = normalizedPatchType;
  }

  if (patch.config !== undefined) {
    const effectiveType =
      normalizedPatchType ??
      normalizeDatabasePropertyType(pagePropertyRecord.type, "");

    if (!effectiveType) {
      return c.json({ error: "Unsupported property type" }, 400);
    }

    propertyValues.config = normalizePropertyConfig(effectiveType, patch.config);
  } else if (normalizedPatchType === "status") {
    propertyValues.config = normalizePropertyConfig(
      "status",
      pagePropertyRecord.config,
    );
  }

  if (patch.position !== undefined) {
    if (!Number.isInteger(patch.position) || (patch.position as number) < 0) {
      return c.json({ error: "position must be a non-negative integer" }, 400);
    }

    columnValues.position = patch.position as number;
  }

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["properties"],

      databaseId: existing.id,
    },
    async (tx) => {
    await tx
      .update(databaseProperty)
      .set(columnValues)
      .where(eq(databaseProperty.id, column.id));

    if (
      patch.name !== undefined ||
      patch.type !== undefined ||
      patch.config !== undefined
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

      const delta = await fetchDatabasePropertyDelta(existing.id, column.id);

      return {
        delta: delta ?? {
          properties: [
            {
              ...column,
              ...columnValues,
              property: {
                id: column.propertyId,
                ...propertyValues,
              },
            },
          ],
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.post("/:id/properties/:databasePropertyId/duplicate", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));

  const { includeValues = false } = body as { includeValues?: unknown };

  if (typeof includeValues !== "boolean") {
    return c.json({ error: "includeValues must be a boolean" }, 400);
  }

  const [source] = await db
    .select({
      column: databaseProperty,
      property: pageProperty,
    })
    .from(databaseProperty)
    .innerJoin(
      pageProperty,
      eq(databaseProperty.propertyId, pageProperty.id),
    )
    .where(
      and(
        eq(databaseProperty.id, c.req.param("databasePropertyId")),
        eq(databaseProperty.databaseId, existing.id),
        eq(pageProperty.workspaceId, existing.workspaceId),
        isNull(pageProperty.deletedAt),
      ),
    )
    .limit(1);

  if (!source) {
    return c.json({ error: "Property not found" }, 404);
  }

  const existingProperties = await db
    .select({ name: pageProperty.name })
    .from(databaseProperty)
    .innerJoin(
      pageProperty,
      eq(databaseProperty.propertyId, pageProperty.id),
    )
    .where(
      and(
        eq(databaseProperty.databaseId, existing.id),
        eq(pageProperty.workspaceId, existing.workspaceId),
        isNull(pageProperty.deletedAt),
      ),
    );
  const sourceValues = includeValues
    ? await db
        .select({
          value: pagePropertyValue.value,
          pageId: pagePropertyValue.pageId,
        })
        .from(pagePropertyValue)
        .innerJoin(
          databaseRow,
          eq(pagePropertyValue.pageId, databaseRow.pageId),
        )
        .where(
          and(
            eq(pagePropertyValue.propertyId, source.property.id),
            eq(databaseRow.databaseId, existing.id),
            isNull(databaseRow.deletedAt),
          ),
        )
    : [];
  const newPropertyId = crypto.randomUUID();
  const columnId = crypto.randomUUID();
  const targetPosition = source.column.position + 1;
  const now = new Date();
  const duplicateName = getDuplicatePropertyName(
    source.property.name,
    new Set(existingProperties.map((property) => property.name)),
  );

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: includeValues ? ["properties", "values"] : ["properties"],

      databaseId: existing.id,
    },
    async (tx) => {
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
        id: newPropertyId,
        workspaceId: existing.workspaceId,
        name: duplicateName,
        type: source.property.type,
        config: source.property.config,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(databaseProperty).values({
        id: columnId,
        databaseId: existing.id,
        propertyId: newPropertyId,
        position: targetPosition,
        createdAt: now,
        updatedAt: now,
      });

      const insertedValues =
        sourceValues.length > 0
          ? sourceValues.map((propertyValue) => ({
              createdAt: now.toISOString(),
              id: crypto.randomUUID(),
              propertyId: newPropertyId,
              updatedAt: now.toISOString(),
              value: propertyValue.value,
              pageId: propertyValue.pageId,
            }))
          : [];

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

      const delta = await fetchDatabasePropertyDelta(existing.id, columnId);

      return {
        delta: {
          ...(delta ?? {
            properties: [
              {
                createdAt: now.toISOString(),
                databaseId: existing.id,
                id: columnId,
                position: targetPosition,
                property: {
                  config: source.property.config,
                  createdAt: now.toISOString(),
                  id: newPropertyId,
                  name: duplicateName,
                  workspaceId: existing.workspaceId,
                  type: source.property.type,
                  updatedAt: now.toISOString(),
                },
                propertyId: newPropertyId,
                updatedAt: now.toISOString(),
                visible: true,
              },
            ],
          }),
          ...(insertedValues.length > 0 ? { values: insertedValues } : {}),
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation), 201);
});

databaseRoutes.delete("/:id/properties/:databasePropertyId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  const [column] = await db
    .select({
      column: databaseProperty,
      property: pageProperty,
    })
    .from(databaseProperty)
    .innerJoin(
      pageProperty,
      eq(databaseProperty.propertyId, pageProperty.id),
    )
    .where(
      and(
        eq(databaseProperty.id, c.req.param("databasePropertyId")),
        eq(databaseProperty.databaseId, existing.id),
        eq(pageProperty.workspaceId, existing.workspaceId),
        isNull(pageProperty.deletedAt),
      ),
    )
    .limit(1);

  if (!column) {
    return c.json({ error: "Property not found" }, 404);
  }

  const now = new Date();

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["properties"],

      databaseId: existing.id,
    },
    async (tx) => {
    await tx
      .update(pageProperty)
      .set({
        deletedAt: now,
        deletedById: user.id,
        updatedAt: now,
      })
      .where(eq(pageProperty.id, column.property.id));
    await tx
      .update(databaseProperty)
      .set({ updatedAt: now })
      .where(eq(databaseProperty.id, column.column.id));

      return {
        delta: {
          removedPropertyIds: [column.column.id],
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.post("/:id/rows", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(
    existing.pageId,
    existing.workspaceId,
    user.id,
    "edit",
  ))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));

  const {
    pageId: existingPageId = null,
    parentRowId = null,
    position,
    sourceDatabaseId = null,
    sourcePropertyMode = "duplicate",
  } = body as {
    pageId?: unknown;
    parentRowId?: unknown;
    position?: unknown;
    sourceDatabaseId?: unknown;
    sourcePropertyMode?: unknown;
    title?: unknown;
  };
  let { title } = body as { title?: unknown };

  if (
    (title !== undefined && typeof title !== "string") ||
    (existingPageId !== null && typeof existingPageId !== "string") ||
    (parentRowId !== null && typeof parentRowId !== "string") ||
    (sourceDatabaseId !== null && typeof sourceDatabaseId !== "string") ||
    (sourcePropertyMode !== "duplicate" && sourcePropertyMode !== "match") ||
    (position !== undefined &&
      (!Number.isInteger(position) || (position as number) < 0))
  ) {
    return c.json({ error: "Invalid row input" }, 400);
  }

  if (existingPageId === existing.pageId) {
    return c.json({ error: "A page cannot be nested inside itself" }, 400);
  }

  const sourceDatabase =
    typeof sourceDatabaseId === "string" && sourceDatabaseId !== existing.id
      ? await getDatabaseRecord(sourceDatabaseId)
      : null;

  if (sourceDatabaseId && sourceDatabaseId !== existing.id) {
    if (!sourceDatabase || sourceDatabase.workspaceId !== existing.workspaceId) {
      return c.json({ error: "Source database not found" }, 404);
    }

    if (!(await canAccessPageInWorkspace(
      sourceDatabase.pageId,
      sourceDatabase.workspaceId,
      user.id,
      "view",
    ))) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const [rowCountRecord] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(databaseRow)
    .where(and(eq(databaseRow.databaseId, existing.id), isNull(databaseRow.deletedAt)));
  const rowCount = rowCountRecord?.count ?? 0;
  const targetPosition =
    position === undefined ? rowCount : Math.min(position as number, rowCount);
  let pageId = typeof existingPageId === "string" ? existingPageId : crypto.randomUUID();
  let pageMetadata: Record<string, unknown> = {};

  if (existingPageId) {
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
          eq(page.id, existingPageId),
          eq(page.workspaceId, existing.workspaceId),
          isNull(page.deletedAt),
        ),
      )
      .limit(1);

    if (!pageRecord) {
      return c.json({ error: "Page not found" }, 404);
    }

    if (!(await canAccessPageInWorkspace(
      pageRecord.id,
      pageRecord.workspaceId,
      user.id,
      "edit",
    ))) {
      return c.json({ error: "Forbidden" }, 403);
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

  const [existingRow] =
    typeof existingPageId === "string"
      ? await db
          .select({ id: databaseRow.id })
          .from(databaseRow)
          .where(
            and(
              eq(databaseRow.databaseId, existing.id),
              eq(databaseRow.pageId, pageId),
              isNull(databaseRow.deletedAt),
            ),
          )
          .limit(1)
      : [];

  if (existingRow) {
    return c.json({ error: "This page is already in this database" }, 409);
  }

  const statusProperties = await db
    .select({
      config: pageProperty.config,
      id: pageProperty.id,
    })
    .from(databaseProperty)
    .innerJoin(
      pageProperty,
      eq(databaseProperty.propertyId, pageProperty.id),
    )
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
  const [databaseFavorite] = await db
    .select({ id: favorite.id })
    .from(favorite)
    .where(and(eq(favorite.userId, user.id), eq(favorite.databaseId, existing.id)))
    .limit(1);
  const shouldInheritFavorite = Boolean(databaseFavorite);

  const rowId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const rowTitle = title as string;
  const changed = new Set<DatabaseChangedArea>(["rows"]);

  if (defaultStatusValues.length > 0) {
    changed.add("values");
  }

  if (sourceDatabase) {
    changed.add("properties");
    changed.add("values");
  }

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: [...changed],

      databaseId: existing.id,
    },
    async (tx) => {
      const inheritedProperties: NonNullable<DatabaseDelta["properties"]> = [];
      let inheritedValues: NonNullable<DatabaseDelta["values"]> = [];

      if (!existingPageId) {
        await tx.insert(page).values({
          id: pageId,
          workspaceId: existing.workspaceId,
          createdById: user.id,
          type: "pageblock",
          name: rowTitle,
          url: "#",
          content: null,
          metadata: pageMetadata,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (sourceDatabase) {
        const targetColumns = await tx
          .select({ column: databaseProperty, property: pageProperty })
          .from(databaseProperty)
          .innerJoin(
            pageProperty,
            eq(databaseProperty.propertyId, pageProperty.id),
          )
          .where(
            and(
              eq(databaseProperty.databaseId, existing.id),
              eq(pageProperty.workspaceId, existing.workspaceId),
              isNull(pageProperty.deletedAt),
            ),
          );
        const sourceColumns = await tx
          .select({ column: databaseProperty, property: pageProperty })
          .from(databaseProperty)
          .innerJoin(
            pageProperty,
            eq(databaseProperty.propertyId, pageProperty.id),
          )
          .where(
            and(
              eq(databaseProperty.databaseId, sourceDatabase.id),
              eq(pageProperty.workspaceId, existing.workspaceId),
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
                    eq(pagePropertyValue.pageId, pageId),
                    inArray(pagePropertyValue.propertyId, [...targetPropertyIds]),
                  ),
                )
            : [];

        inheritedValues.push(
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
                    eq(pagePropertyValue.pageId, pageId),
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
        const columnsToInsert: Array<{
          column: (typeof missingColumns)[number]["column"];
          property: (typeof missingColumns)[number]["property"];
        }> = [];

        for (const sourceColumn of missingColumns) {
          const targetColumn =
            sourcePropertyMode === "match"
              ? targetColumnsByName.get(getPropertyNameKey(sourceColumn.property.name))
              : null;
          const sourceValue = sourceValueByPropertyId.get(
            sourceColumn.column.propertyId,
          );
          const targetPropertyType = targetColumn
            ? normalizeDatabasePropertyType(targetColumn.property.type)
            : null;

          if (!targetColumn) {
            columnsToInsert.push(sourceColumn);
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
          const mergedConfig = mergeSelectOptionsForValue(
            targetPropertyType,
            targetColumn.property.config,
            nextValue,
          );

          try {
            validateCellValue(
              targetPropertyType,
              mergedConfig.config,
              nextValue,
            );
          } catch (error) {
            if (error instanceof ServiceMutationError) {
              throw new DatabaseMutationError(error.message, error.status);
            }

            throw error;
          }

          if (mergedConfig.changed) {
            await tx
              .update(pageProperty)
              .set({ config: mergedConfig.config, updatedAt: now })
              .where(eq(pageProperty.id, targetColumn.property.id));
            await tx
              .update(databaseProperty)
              .set({ updatedAt: now })
              .where(eq(databaseProperty.id, targetColumn.column.id));

            inheritedProperties.push({
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

          await tx
            .insert(pagePropertyValue)
            .values({
              id: crypto.randomUUID(),
              pageId,
              propertyId: targetColumn.property.id,
              value: nextValue,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                pagePropertyValue.pageId,
                pagePropertyValue.propertyId,
              ],
              set: { value: nextValue, updatedAt: now },
            });

          inheritedValues.push({
            propertyId: targetColumn.property.id,
            updatedAt: nowIso,
            value: nextValue,
            pageId,
          });
        }

        if (columnsToInsert.length > 0) {
          const insertedColumns = columnsToInsert.map(({ column }, index) => ({
            id: crypto.randomUUID(),
            databaseId: existing.id,
            propertyId: column.propertyId,
            position: targetColumns.length + index,
            width: column.width,
            visible: column.visible,
            createdAt: now,
            updatedAt: now,
          }));

          await tx.insert(databaseProperty).values(insertedColumns);

          inheritedProperties.push(
            ...insertedColumns.map((column, index) => ({
              ...column,
              createdAt: nowIso,
              updatedAt: nowIso,
              property: columnsToInsert[index].property,
            })),
          );

          inheritedValues.push(
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
      await incrementDatabaseRowPlacementPositions(
        tx,
        existing.id,
        targetPosition,
        now,
      );
      await tx.insert(databaseRow).values({
        id: rowId,
        databaseId: existing.id,
        pageId,
        parentRowId,
        position: targetPosition,
        createdById: user.id,
        lastEditedById: user.id,
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

      const inheritedValuePropertyIds = new Set(
        inheritedValues
          .filter((value) => value.pageId === pageId)
          .map((value) => value.propertyId),
      );
      const insertedValues = defaultStatusValues
        .filter((property) => !inheritedValuePropertyIds.has(property.propertyId))
        .map((property) => ({
          createdAt: nowIso,
          id: crypto.randomUUID(),
          propertyId: property.propertyId,
          updatedAt: nowIso,
          value: property.value,
          pageId: pageId,
        }));

      if (insertedValues.length > 0) {
        await tx
          .insert(pagePropertyValue)
          .values(
            insertedValues.map((propertyValue) => ({
              id: propertyValue.id,
              propertyId: propertyValue.propertyId,
              value: propertyValue.value,
              pageId: propertyValue.pageId,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .onConflictDoNothing({
            target: [
              pagePropertyValue.pageId,
              pagePropertyValue.propertyId,
            ],
          });
      }

      if (shouldInheritFavorite) {
        await tx
          .insert(favorite)
          .values({
            id: crypto.randomUUID(),
            userId: user.id,
            pageId: pageId,
          })
          .onConflictDoNothing({
            target: [favorite.userId, favorite.pageId],
          });
      }

      return {
        delta: {
          ...(sourceDatabase
            ? {
                properties: inheritedProperties,
                rows: [
                  {
                    createdAt: nowIso,
                    createdById: user.id,
                    databaseId: existing.id,
                    id: rowId,
                    lastEditedById: user.id,
                    page: {
                      id: pageId,
                      metadata: pageMetadata,
                      name: rowTitle,
                    },
                    pageId,
                    parentRowId,
                    position: targetPosition,
                    updatedAt: nowIso,
                  },
                ],
              }
            : {}),
          ...(insertedValues.length > 0 || inheritedValues.length > 0
            ? { values: [...insertedValues, ...inheritedValues] }
            : {}),
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  if (sourceDatabase) {
    return c.json(mutationResponse(mutation), 201);
  }

  return c.json(
    {
      createdAt: nowIso,
      databaseId: existing.id,
      isFavorite: shouldInheritFavorite,
      pageId,
      parentRowId,
      position: targetPosition,
      rowId,
      title: rowTitle,
      updatedAt: nowIso,
      values: mutation.delta.values ?? [],
    },
    201,
  );
});

databaseRoutes.patch("/:id/rows/reorder", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }


  const { rowIds } = body as { rowIds?: unknown };

  if (
    !Array.isArray(rowIds) ||
    rowIds.some((rowId) => typeof rowId !== "string")
  ) {
    return c.json({ error: "rowIds must be an array of strings" }, 400);
  }

  const nextRowIds = rowIds as string[];

  if (hasDuplicateValues(nextRowIds)) {
    return c.json({ error: "rowIds must not contain duplicates" }, 400);
  }

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["rows"],

      databaseId: existing.id,
    },
    async (tx) => {
    const rows = await tx
      .select({ id: databaseRow.id })
      .from(databaseRow)
      .where(
        and(eq(databaseRow.databaseId, existing.id), isNull(databaseRow.deletedAt)),
      );
    const existingRowIds = new Set(rows.map((row) => row.id));

    if (
      nextRowIds.length !== existingRowIds.size ||
      nextRowIds.some((rowId) => !existingRowIds.has(rowId))
    ) {
      throw new DatabaseMutationError(
        "rowIds must include every active database row",
      );
    }

    const now = new Date();

    await updateDatabaseRowPositions(tx, existing.id, nextRowIds, now);
    await updateDatabaseRowPlacementPositions(tx, existing.id, nextRowIds, now);

      return {
        delta: rowPositionDelta(nextRowIds),
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.patch("/:id/rows/:rowId/move", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }


  const { groupPropertyId, groupValue = null, rowIds } = body as {
    groupPropertyId?: unknown;
    groupValue?: unknown;
    rowIds?: unknown;
  };

  if (
    !Array.isArray(rowIds) ||
    rowIds.some((rowId) => typeof rowId !== "string") ||
    (groupPropertyId !== undefined && typeof groupPropertyId !== "string")
  ) {
    return c.json({ error: "Invalid row move input" }, 400);
  }

  const rowId = c.req.param("rowId");
  const nextRowIds = rowIds as string[];
  const nextGroupPropertyId = groupPropertyId as string | undefined;

  if (hasDuplicateValues(nextRowIds)) {
    return c.json({ error: "rowIds must not contain duplicates" }, 400);
  }

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: nextGroupPropertyId ? ["rows", "values"] : ["rows"],

      databaseId: existing.id,
    },
    async (tx) => {
    const rows = await tx
      .select({ id: databaseRow.id, pageId: databaseRow.pageId })
      .from(databaseRow)
      .where(
        and(eq(databaseRow.databaseId, existing.id), isNull(databaseRow.deletedAt)),
      );
    const row = rows.find((item) => item.id === rowId);
    const existingRowIds = new Set(rows.map((item) => item.id));

    if (!row) {
      throw new DatabaseMutationError("Row not found", 404);
    }

    if (
      nextRowIds.length !== existingRowIds.size ||
      nextRowIds.some((nextRowId) => !existingRowIds.has(nextRowId))
    ) {
      throw new DatabaseMutationError(
        "rowIds must include every active database row",
      );
    }

    let property: { config: unknown; id: string; type: string } | null = null;

    if (nextGroupPropertyId) {
      const [groupProperty] = await tx
        .select({
          config: pageProperty.config,
          id: pageProperty.id,
          type: pageProperty.type,
        })
        .from(databaseProperty)
        .innerJoin(
          pageProperty,
          eq(databaseProperty.propertyId, pageProperty.id),
        )
        .where(
          and(
            eq(databaseProperty.databaseId, existing.id),
            eq(databaseProperty.propertyId, nextGroupPropertyId),
            eq(pageProperty.workspaceId, existing.workspaceId),
            isNull(pageProperty.deletedAt),
          ),
        )
        .limit(1);

      if (!groupProperty) {
        throw new DatabaseMutationError("Property not found", 404);
      }

      try {
        validateCellValue(groupProperty.type, groupProperty.config, groupValue);
      } catch (error) {
        if (error instanceof ServiceMutationError) {
          throw new DatabaseMutationError(error.message, error.status);
        }

        throw error;
      }

      property = groupProperty;
    }

    const now = new Date();

    await updateDatabaseRowPositions(tx, existing.id, nextRowIds, now);
    await updateDatabaseRowPlacementPositions(tx, existing.id, nextRowIds, now);

    if (property) {
      await tx
        .insert(pagePropertyValue)
        .values({
          id: crypto.randomUUID(),
          pageId: row.pageId,
          propertyId: property.id,
          value: groupValue,
        })
        .onConflictDoUpdate({
          target: [
            pagePropertyValue.pageId,
            pagePropertyValue.propertyId,
          ],
          set: {
            value: groupValue,
            updatedAt: now,
          },
        });
      await tx
        .update(databaseRow)
        .set({
          lastEditedById: user.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(databaseRow.id, rowId),
            eq(databaseRow.databaseId, existing.id),
          ),
        );
      await tx
        .update(page)
        .set({ updatedAt: now })
        .where(eq(page.id, row.pageId));
    }

      return {
        delta: {
          ...rowPositionDelta(nextRowIds),
          ...(property
            ? {
                rows: [
                  {
                    id: rowId,
                    lastEditedById: user.id,
                    updatedAt: now.toISOString(),
                  },
                ],
                values: [
                  {
                    propertyId: property.id,
                    updatedAt: now.toISOString(),
                    value: groupValue,
                    pageId: row.pageId,
                  },
                ],
              }
            : {}),
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});

databaseRoutes.put("/:id/rows/:rowId/properties/:propertyId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getDatabaseRecord(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.pageId, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }


  const { value = null } = body as { value?: unknown };
  const rowId = c.req.param("rowId");
  const propertyId = c.req.param("propertyId");

  const [row] = await db
    .select({ id: databaseRow.id, pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.id, rowId),
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
    .innerJoin(
      pageProperty,
      eq(databaseProperty.propertyId, pageProperty.id),
    )
    .where(
      and(
        eq(databaseProperty.databaseId, existing.id),
        eq(databaseProperty.propertyId, propertyId),
        eq(pageProperty.workspaceId, existing.workspaceId),
        isNull(pageProperty.deletedAt),
      ),
    )
    .limit(1);

  if (!row || !property) {
    return c.json({ error: "Row or property not found" }, 404);
  }

  try {
    validateCellValue(property.type, property.config, value);
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return c.json({ error: error.message }, error.status === 404 ? 404 : 400);
    }

    throw error;
  }

  const now = new Date();

  const mutation = await commitDatabaseMutation(
    c,
    {
      actorId: user.id,
      changed: ["values"],

      databaseId: existing.id,
    },
    async (tx) => {
    await tx
      .insert(pagePropertyValue)
      .values({
        id: crypto.randomUUID(),
        pageId: row.pageId,
        propertyId,
        value,
      })
      .onConflictDoUpdate({
        target: [
          pagePropertyValue.pageId,
          pagePropertyValue.propertyId,
        ],
        set: {
          value,
          updatedAt: now,
        },
      });
    await tx
      .update(databaseRow)
      .set({
        lastEditedById: user.id,
        updatedAt: now,
      })
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
              lastEditedById: user.id,
              updatedAt: now.toISOString(),
            },
          ],
          values: [
            {
              propertyId,
              updatedAt: now.toISOString(),
              value,
              pageId: row.pageId,
            },
          ],
        },
      };
    },
  );

  if (!mutation.ok) {
    return databaseMutationErrorResponse(c, mutation.error);
  }

  return c.json(mutationResponse(mutation));
});
