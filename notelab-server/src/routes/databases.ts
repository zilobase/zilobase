import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  canAccessWorkspace,
  getAccessibleWorkspaceIds,
  isWorkspacePublished,
} from "../access";
import { rejectMismatchedApiKeyOrganization } from "../api-keys";
import { db } from "../db";
import {
  database,
  databaseProperty,
  databaseRow,
  databaseView,
  favorite,
  workspace,
  workspaceProperty,
  workspacePropertyValue,
} from "../db/schema";
import type { AppBindings } from "../types";

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

const readParentWorkspaceId = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const parentWorkspaceId = (metadata as { parentWorkspaceId?: unknown })
    .parentWorkspaceId;

  return typeof parentWorkspaceId === "string" && parentWorkspaceId.length > 0
    ? parentWorkspaceId
    : null;
};

const getNestedDatabasePageIds = async (
  rootDatabaseId: string,
  organizationId: string,
  accessibleIds: Set<string>,
) => {
  const [workspaceRecords, databaseRecords, databaseRows] = await Promise.all([
    db
      .select({
        id: workspace.id,
        metadata: workspace.metadata,
      })
      .from(workspace)
      .where(
        and(
          eq(workspace.organizationId, organizationId),
          isNull(workspace.deletedAt),
        ),
      ),
    db
      .select({
        id: database.id,
        pageId: database.pageId,
      })
      .from(database)
      .where(
        and(
          eq(database.organizationId, organizationId),
          isNull(database.deletedAt),
        ),
      ),
    db
      .select({
        databaseId: databaseRow.databaseId,
        pageId: databaseRow.pageId,
      })
      .from(databaseRow)
      .where(isNull(databaseRow.deletedAt)),
  ]);
  const childIdsByParentId = new Map<string, Set<string>>();
  const rootPageIds = new Set<string>();

  for (const record of workspaceRecords) {
    const parentWorkspaceId = readParentWorkspaceId(record.metadata);

    if (!parentWorkspaceId) {
      continue;
    }

    const childIds = childIdsByParentId.get(parentWorkspaceId) ?? new Set();

    childIds.add(record.id);
    childIdsByParentId.set(parentWorkspaceId, childIds);
  }

  const databasePageIdByDatabaseId = new Map(
    databaseRecords.map((record) => [record.id, record.pageId]),
  );

  for (const row of databaseRows) {
    if (row.databaseId === rootDatabaseId) {
      rootPageIds.add(row.pageId);
    }

    const parentWorkspaceId = databasePageIdByDatabaseId.get(row.databaseId);

    if (!parentWorkspaceId) {
      continue;
    }

    const childIds = childIdsByParentId.get(parentWorkspaceId) ?? new Set();

    childIds.add(row.pageId);
    childIdsByParentId.set(parentWorkspaceId, childIds);
  }

  const nestedIds = new Set<string>();
  const pendingIds = [...rootPageIds];

  while (pendingIds.length > 0) {
    const workspaceId = pendingIds.shift();

    if (
      !workspaceId ||
      nestedIds.has(workspaceId) ||
      !accessibleIds.has(workspaceId)
    ) {
      continue;
    }

    nestedIds.add(workspaceId);

    for (const childId of childIdsByParentId.get(workspaceId) ?? []) {
      pendingIds.push(childId);
    }
  }

  return [...nestedIds];
};

type StatusOption = {
  id: string;
  name: string;
};

type StatusPropertyConfig = {
  defaultOptionId?: unknown;
  options?: unknown;
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

const getDatabasePayload = async (id: string, userId?: string) => {
  const record = await getDatabaseRecord(id);

  if (!record) {
    return null;
  }

  const [properties, views, rows] = await Promise.all([
    db
      .select({
        column: databaseProperty,
        property: workspaceProperty,
      })
      .from(databaseProperty)
      .innerJoin(
        workspaceProperty,
        eq(databaseProperty.propertyId, workspaceProperty.id),
      )
      .where(
        and(
          eq(databaseProperty.databaseId, id),
          isNull(workspaceProperty.deletedAt),
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
          id: workspace.id,
          name: workspace.name,
          metadata: workspace.metadata,
        },
      })
      .from(databaseRow)
      .innerJoin(workspace, eq(databaseRow.pageId, workspace.id))
      .where(
        and(
          eq(databaseRow.databaseId, id),
          isNull(databaseRow.deletedAt),
          isNull(workspace.deletedAt),
        ),
      )
      .orderBy(asc(databaseRow.position)),
  ]);

  const pageIds = rows.map(({ row }) => row.pageId);
  const propertyIds = properties.map(({ property }) => property.id);
  const values =
    pageIds.length > 0 && propertyIds.length > 0
      ? await db
          .select()
          .from(workspacePropertyValue)
          .where(
            and(
              inArray(workspacePropertyValue.workspaceId, pageIds),
              inArray(workspacePropertyValue.propertyId, propertyIds),
            ),
          )
      : [];
  const [favoriteRecord] = userId
    ? await db
        .select({ id: favorite.id })
        .from(favorite)
        .where(and(eq(favorite.userId, userId), eq(favorite.databaseId, id)))
        .limit(1)
    : [];

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
    organizationId,
    pageId,
    name = "New database",
  } = body as {
    organizationId?: unknown;
    pageId?: unknown;
    name?: unknown;
  };

  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyOrganization(c, organizationId);

  if (mismatch) {
    return mismatch;
  }

  if (typeof pageId !== "string" || pageId.length === 0) {
    return c.json({ error: "pageId is required" }, 400);
  }

  if (typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  const [page] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(
      and(
        eq(workspace.id, pageId),
        eq(workspace.organizationId, organizationId),
        isNull(workspace.deletedAt),
      ),
    )
    .limit(1);

  if (!page) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessWorkspace(page.id, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const databaseId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(database).values({
      id: databaseId,
      organizationId,
      pageId,
      name,
    });
    await tx.insert(databaseView).values({
      id: crypto.randomUUID(),
      databaseId,
      type: "table",
      name: "Table",
      position: 0,
    });
  });

  const payload = await getDatabasePayload(databaseId, user.id);

  return c.json(payload, 201);
});

databaseRoutes.get("/:id", async (c) => {
  const user = requireUser(c);

  const payload = await getDatabasePayload(c.req.param("id"), user?.id);

  if (!payload) {
    return c.json({ error: "Database not found" }, 404);
  }

  const canView = user
    ? await canAccessWorkspace(payload.database.pageId, user.id, "view")
    : false;
  const published = await isWorkspacePublished(payload.database.pageId);

  if (!canView && !published) {
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json(payload);
});

databaseRoutes.get("/:id/published", async (c) => {
  const record = await getDatabaseRecord(c.req.param("id"));

  if (!record) {
    return c.json({ published: false }, 404);
  }

  return c.json({ published: await isWorkspacePublished(record.pageId) });
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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accessibleIds = await getAccessibleWorkspaceIds(
    existing.organizationId,
    user.id,
  );
  const nestedPageIds = await getNestedDatabasePageIds(
    existing.id,
    existing.organizationId,
    accessibleIds,
  );

  await db.transaction(async (tx) => {
    await tx
      .insert(favorite)
      .values({
        databaseId: existing.id,
        id: crypto.randomUUID(),
        userId: user.id,
      })
      .onConflictDoNothing({
        target: [favorite.userId, favorite.databaseId],
      });

    if (nestedPageIds.length > 0) {
      await tx
        .insert(favorite)
        .values(
          nestedPageIds.map((workspaceId) => ({
            id: crypto.randomUUID(),
            userId: user.id,
            workspaceId,
          })),
        )
        .onConflictDoNothing({
          target: [favorite.userId, favorite.workspaceId],
        });
    }
  });

  const payload = await getDatabasePayload(existing.id, user.id);

  return c.json(payload);
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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accessibleIds = await getAccessibleWorkspaceIds(
    existing.organizationId,
    user.id,
  );
  const nestedPageIds = await getNestedDatabasePageIds(
    existing.id,
    existing.organizationId,
    accessibleIds,
  );

  await db.transaction(async (tx) => {
    await tx
      .delete(favorite)
      .where(
        and(eq(favorite.userId, user.id), eq(favorite.databaseId, existing.id)),
      );

    if (nestedPageIds.length > 0) {
      await tx
        .delete(favorite)
        .where(
          and(
            eq(favorite.userId, user.id),
            inArray(favorite.workspaceId, nestedPageIds),
          ),
        );
    }
  });

  const payload = await getDatabasePayload(existing.id, user.id);

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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "edit"))) {
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

  await db.update(database).set(values).where(eq(database.id, existing.id));

  const payload = await getDatabasePayload(existing.id, user.id);

  return c.json(payload);
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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name = "Property", type = "text", config = null } = body as {
    name?: unknown;
    type?: unknown;
    config?: unknown;
  };

  if (typeof name !== "string" || typeof type !== "string") {
    return c.json({ error: "name and type must be strings" }, 400);
  }

  const columns = await db
    .select({ position: databaseProperty.position })
    .from(databaseProperty)
    .where(eq(databaseProperty.databaseId, existing.id));
  const propertyId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(workspaceProperty).values({
      id: propertyId,
      organizationId: existing.organizationId,
      name,
      type,
      config,
    });
    await tx.insert(databaseProperty).values({
      id: crypto.randomUUID(),
      databaseId: existing.id,
      propertyId,
      position: columns.length,
    });
  });

  const payload = await getDatabasePayload(existing.id, user.id);

  return c.json(payload, 201);
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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "edit"))) {
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

  const patch = body as {
    config?: unknown;
    name?: unknown;
    position?: unknown;
    type?: unknown;
    visible?: unknown;
    width?: unknown;
  };
  const columnValues: Partial<typeof databaseProperty.$inferInsert> = {
    updatedAt: new Date(),
  };
  const propertyValues: Partial<typeof workspaceProperty.$inferInsert> = {
    updatedAt: new Date(),
  };

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

    propertyValues.type = patch.type;
  }

  if (patch.config !== undefined) {
    propertyValues.config = patch.config;
  }

  if (patch.position !== undefined) {
    if (!Number.isInteger(patch.position) || (patch.position as number) < 0) {
      return c.json({ error: "position must be a non-negative integer" }, 400);
    }

    columnValues.position = patch.position as number;
  }

  if (patch.width !== undefined) {
    if (
      patch.width !== null &&
      (!Number.isInteger(patch.width) || (patch.width as number) < 0)
    ) {
      return c.json({ error: "width must be a non-negative integer" }, 400);
    }

    columnValues.width = patch.width as number | null;
  }

  if (patch.visible !== undefined) {
    if (typeof patch.visible !== "boolean") {
      return c.json({ error: "visible must be a boolean" }, 400);
    }

    columnValues.visible = patch.visible;
  }

  await db.transaction(async (tx) => {
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
        .update(workspaceProperty)
        .set(propertyValues)
        .where(
          and(
            eq(workspaceProperty.id, column.propertyId),
            eq(workspaceProperty.organizationId, existing.organizationId),
          ),
        );
    }
  });

  const payload = await getDatabasePayload(existing.id, user.id);

  return c.json(payload);
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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { pageId: existingPageId = null, parentRowId = null, position } = body as {
    pageId?: unknown;
    parentRowId?: unknown;
    position?: unknown;
    title?: unknown;
  };
  let { title } = body as { title?: unknown };

  if (
    (title !== undefined && typeof title !== "string") ||
    (existingPageId !== null && typeof existingPageId !== "string") ||
    (parentRowId !== null && typeof parentRowId !== "string") ||
    (position !== undefined &&
      (!Number.isInteger(position) || (position as number) < 0))
  ) {
    return c.json({ error: "Invalid row input" }, 400);
  }

  if (existingPageId === existing.pageId) {
    return c.json({ error: "A page cannot be nested inside itself" }, 400);
  }

  const rows = await db
    .select({
      id: databaseRow.id,
      pageId: databaseRow.pageId,
      position: databaseRow.position,
    })
    .from(databaseRow)
    .where(and(eq(databaseRow.databaseId, existing.id), isNull(databaseRow.deletedAt)))
    .orderBy(asc(databaseRow.position));
  const targetPosition =
    position === undefined ? rows.length : Math.min(position as number, rows.length);
  let pageId = typeof existingPageId === "string" ? existingPageId : crypto.randomUUID();
  let pageMetadata: Record<string, unknown> = {};

  if (existingPageId) {
    const [page] = await db
      .select({
        id: workspace.id,
        metadata: workspace.metadata,
        name: workspace.name,
        organizationId: workspace.organizationId,
      })
      .from(workspace)
      .where(
        and(
          eq(workspace.id, existingPageId),
          eq(workspace.organizationId, existing.organizationId),
          isNull(workspace.deletedAt),
        ),
      )
      .limit(1);

    if (!page) {
      return c.json({ error: "Page not found" }, 404);
    }

    if (!(await canAccessWorkspace(page.id, user.id, "edit"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (title === undefined) {
      title = page.name.trim() || "Untitled";
    }

    if (
      page.metadata &&
      typeof page.metadata === "object" &&
      !Array.isArray(page.metadata)
    ) {
      pageMetadata = page.metadata as Record<string, unknown>;
    }
  } else {
    title = title ?? "Untitled";
  }

  const existingRow = rows.find((row) => row.pageId === pageId);

  if (existingRow) {
    return c.json({ error: "This page is already in this database" }, 409);
  }

  const statusProperties = await db
    .select({
      config: workspaceProperty.config,
      id: workspaceProperty.id,
    })
    .from(databaseProperty)
    .innerJoin(
      workspaceProperty,
      eq(databaseProperty.propertyId, workspaceProperty.id),
    )
    .where(
      and(
        eq(databaseProperty.databaseId, existing.id),
        eq(workspaceProperty.type, "status"),
        isNull(workspaceProperty.deletedAt),
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

  await db.transaction(async (tx) => {
    if (existingPageId) {
      await tx
        .update(workspace)
        .set({
          metadata: { ...pageMetadata, parentWorkspaceId: existing.pageId },
          updatedAt: new Date(),
        })
        .where(eq(workspace.id, existingPageId));
    } else {
      await tx.insert(workspace).values({
        id: pageId,
        organizationId: existing.organizationId,
        createdById: user.id,
        type: "pageblock",
        name: title as string,
        url: "#",
        content: null,
        metadata: { parentWorkspaceId: existing.pageId },
      });
    }

    await tx
      .update(databaseRow)
      .set({
        position: sql`${databaseRow.position} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(databaseRow.databaseId, existing.id),
          isNull(databaseRow.deletedAt),
          gte(databaseRow.position, targetPosition),
        ),
      );
    await tx.insert(databaseRow).values({
      id: crypto.randomUUID(),
      databaseId: existing.id,
      pageId,
      parentRowId,
      position: targetPosition,
      createdById: user.id,
      lastEditedById: user.id,
    });

    if (defaultStatusValues.length > 0) {
      await tx
        .insert(workspacePropertyValue)
        .values(
          defaultStatusValues.map((property) => ({
            id: crypto.randomUUID(),
            propertyId: property.propertyId,
            value: property.value,
            workspaceId: pageId,
          })),
        )
        .onConflictDoNothing({
          target: [
            workspacePropertyValue.workspaceId,
            workspacePropertyValue.propertyId,
          ],
        });
    }
  });

  const payload = await getDatabasePayload(existing.id, user.id);

  return c.json(payload, 201);
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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "edit"))) {
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

  const rows = await db
    .select({ id: databaseRow.id })
    .from(databaseRow)
    .where(and(eq(databaseRow.databaseId, existing.id), isNull(databaseRow.deletedAt)));
  const existingRowIds = new Set(rows.map((row) => row.id));

  if (
    rowIds.length !== existingRowIds.size ||
    rowIds.some((rowId) => !existingRowIds.has(rowId))
  ) {
    return c.json({ error: "rowIds must include every active database row" }, 400);
  }

  await db.transaction(async (tx) => {
    await Promise.all(
      rowIds.map((rowId, position) =>
        tx
          .update(databaseRow)
          .set({ position, updatedAt: new Date() })
          .where(
            and(eq(databaseRow.id, rowId), eq(databaseRow.databaseId, existing.id)),
          ),
      ),
    );
  });

  const payload = await getDatabasePayload(existing.id, user.id);

  return c.json(payload);
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

  if (!(await canAccessWorkspace(existing.pageId, user.id, "edit"))) {
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
    .select({ id: workspaceProperty.id })
    .from(databaseProperty)
    .innerJoin(
      workspaceProperty,
      eq(databaseProperty.propertyId, workspaceProperty.id),
    )
    .where(
      and(
        eq(databaseProperty.databaseId, existing.id),
        eq(databaseProperty.propertyId, propertyId),
        eq(workspaceProperty.organizationId, existing.organizationId),
        isNull(workspaceProperty.deletedAt),
      ),
    )
    .limit(1);

  if (!row || !property) {
    return c.json({ error: "Row or property not found" }, 404);
  }

  await db
    .insert(workspacePropertyValue)
    .values({
      id: crypto.randomUUID(),
      workspaceId: row.pageId,
      propertyId,
      value,
    })
    .onConflictDoUpdate({
      target: [
        workspacePropertyValue.workspaceId,
        workspacePropertyValue.propertyId,
      ],
      set: {
        value,
        updatedAt: new Date(),
      },
    });

  const payload = await getDatabasePayload(existing.id, user.id);

  return c.json(payload);
});
