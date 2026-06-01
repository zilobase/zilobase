import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  canAccessWorkspace,
  getAccessibleWorkspaceIds,
  getEffectiveWorkspaceAccess,
  getMembership,
  getWorkspaceRecord,
  hasAccess,
  isWorkspacePublished,
  normalizeAccessLevel,
} from "../access";
import { rejectMismatchedApiKeyOrganization } from "../api-keys";
import { db } from "../db";
import {
  database,
  databaseProperty,
  databaseRow,
  favorite,
  member,
  team,
  user,
  workspace,
  workspaceAccess,
  workspaceProperty,
  workspacePropertyValue,
} from "../db/schema";
import type { AppBindings } from "../types";

export const workspaceRoutes = new Hono<AppBindings>();

const getWorkspace = getWorkspaceRecord;

const requireUser = (c: Context<AppBindings>) => {
  const user = c.get("user");

  if (!user) {
    return null;
  }

  return user;
};

const getWorkspacePropertyPayload = async (
  workspaceId: string,
  organizationId: string,
) => {
  const databaseProperties = await db
    .select({ property: workspaceProperty })
    .from(databaseRow)
    .innerJoin(
      databaseProperty,
      eq(databaseRow.databaseId, databaseProperty.databaseId),
    )
    .innerJoin(
      workspaceProperty,
      eq(databaseProperty.propertyId, workspaceProperty.id),
    )
    .where(
      and(
        eq(databaseRow.pageId, workspaceId),
        eq(workspaceProperty.organizationId, organizationId),
        isNull(databaseRow.deletedAt),
        isNull(workspaceProperty.deletedAt),
      ),
    )
    .orderBy(asc(workspaceProperty.createdAt));

  const properties = Array.from(
    new Map(
      databaseProperties.map(({ property }) => [property.id, property]),
    ).values(),
  );
  const values = await db
    .select()
    .from(workspacePropertyValue)
    .where(eq(workspacePropertyValue.workspaceId, workspaceId));

  return { properties, values };
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

const getNestedWorkspaceIds = async (
  rootWorkspaceId: string,
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
    const parentWorkspaceId = databasePageIdByDatabaseId.get(row.databaseId);

    if (!parentWorkspaceId) {
      continue;
    }

    const childIds = childIdsByParentId.get(parentWorkspaceId) ?? new Set();

    childIds.add(row.pageId);
    childIdsByParentId.set(parentWorkspaceId, childIds);
  }

  const nestedIds = new Set<string>();
  const pendingIds = [rootWorkspaceId];

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

const getNestedFavoriteTargetIds = async (
  rootWorkspaceId: string,
  organizationId: string,
  accessibleIds: Set<string>,
) => {
  const workspaceIds = await getNestedWorkspaceIds(
    rootWorkspaceId,
    organizationId,
    accessibleIds,
  );
  const workspaceIdSet = new Set(workspaceIds);
  const databaseRecords = await db
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
    );

  return {
    databaseIds: databaseRecords
      .filter(
        (record) =>
          workspaceIdSet.has(record.pageId) && accessibleIds.has(record.pageId),
      )
      .map((record) => record.id),
    workspaceIds,
  };
};

workspaceRoutes.get("/", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const organizationId = c.req.query("organizationId");

  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyOrganization(c, organizationId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(organizationId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accessibleIds = await getAccessibleWorkspaceIds(organizationId, user.id);

  const records = await db
    .select()
    .from(workspace)
    .where(
      and(
        eq(workspace.organizationId, organizationId),
        isNull(workspace.deletedAt),
      ),
    );
  const sharedWorkspaceRows = await db
    .select({ workspaceId: workspaceAccess.workspaceId })
    .from(workspaceAccess)
    .where(eq(workspaceAccess.organizationId, organizationId));
  const favoriteRows = await db
    .select({
      databaseId: favorite.databaseId,
      workspaceId: favorite.workspaceId,
    })
    .from(favorite)
    .where(eq(favorite.userId, user.id));
  const teamspaceIds = new Set(
    sharedWorkspaceRows.map((row) => row.workspaceId),
  );
  const favoriteWorkspaceIds = new Set(
    favoriteRows
      .map((row) => row.workspaceId)
      .filter((workspaceId): workspaceId is string => Boolean(workspaceId)),
  );
  const favoriteDatabaseIds = new Set(
    favoriteRows
      .map((row) => row.databaseId)
      .filter((databaseId): databaseId is string => Boolean(databaseId)),
  );
  const accessibleRecords = records.filter((record) =>
    accessibleIds.has(record.id),
  );
  const accessibleRecordIds = new Set(
    accessibleRecords.map((record) => record.id),
  );
  const databaseRecords = await db
    .select()
    .from(database)
    .where(
      and(
        eq(database.organizationId, organizationId),
        isNull(database.deletedAt),
      ),
    );
  const activeDatabases = databaseRecords.filter((record) =>
    accessibleRecordIds.has(record.pageId),
  );
  const activeDatabaseIds = new Set(activeDatabases.map((record) => record.id));
  const databaseRows = await db
    .select()
    .from(databaseRow)
    .where(isNull(databaseRow.deletedAt));
  const rowsByDatabaseId = new Map<string, typeof databaseRows>();

  for (const row of databaseRows) {
    if (
      !activeDatabaseIds.has(row.databaseId) ||
      !accessibleRecordIds.has(row.pageId)
    ) {
      continue;
    }

    rowsByDatabaseId.set(row.databaseId, [
      ...(rowsByDatabaseId.get(row.databaseId) ?? []),
      row,
    ]);
  }
  const databasesByPageId = new Map<
    string,
    Array<
      (typeof activeDatabases)[number] & {
        isFavorite: boolean;
        rows: typeof databaseRows;
      }
    >
  >();

  for (const record of activeDatabases) {
    const rows = [...(rowsByDatabaseId.get(record.id) ?? [])].sort(
      (first, second) => first.position - second.position,
    );

    databasesByPageId.set(record.pageId, [
      ...(databasesByPageId.get(record.pageId) ?? []),
      { ...record, isFavorite: favoriteDatabaseIds.has(record.id), rows },
    ]);
  }

  return c.json({
    workspaces: accessibleRecords
      .map((record) => ({
        ...record,
        databases: databasesByPageId.get(record.id) ?? [],
        isFavorite: favoriteWorkspaceIds.has(record.id),
        isTeamspace: teamspaceIds.has(record.id),
      })),
  });
});

workspaceRoutes.post("/", async (c) => {
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
    type = "pageblock",
    name = "",
    url = "#",
    content = null,
    metadata = null,
  } = body as {
    organizationId?: unknown;
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
  };

  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyOrganization(c, organizationId);

  if (mismatch) {
    return mismatch;
  }

  if (typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  if (typeof type !== "string" || typeof url !== "string") {
    return c.json({ error: "type and url must be strings" }, 400);
  }

  if (!(await getMembership(organizationId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (
    typeof metadata === "object" &&
    metadata &&
    !Array.isArray(metadata) &&
    typeof (metadata as { parentWorkspaceId?: unknown }).parentWorkspaceId ===
      "string" &&
    !(await canAccessWorkspace(
      (metadata as { parentWorkspaceId: string }).parentWorkspaceId,
      user.id,
      "edit",
    ))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [record] = await db
    .insert(workspace)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      createdById: user.id,
      type,
      name,
      url,
      content,
      metadata,
    })
    .returning();

  return c.json({ workspace: record }, 201);
});

workspaceRoutes.get("/:id", async (c) => {
  const user = requireUser(c);

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const accessLevel = user
    ? await getEffectiveWorkspaceAccess(record.id, user.id)
    : "none";
  const published = await isWorkspacePublished(record.id);

  if (!hasAccess(accessLevel, "view") && !published) {
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({ error: "Forbidden" }, 403);
  }

  const [favoriteRecord] = user
    ? await db
        .select({ id: favorite.id })
        .from(favorite)
        .where(
          and(
            eq(favorite.userId, user.id),
            eq(favorite.workspaceId, record.id),
          ),
        )
        .limit(1)
    : [];

  return c.json({
    accessLevel: hasAccess(accessLevel, "view") ? accessLevel : "view",
    workspace: { ...record, isFavorite: Boolean(favoriteRecord) },
  });
});

workspaceRoutes.get("/:id/published", async (c) => {
  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ published: false }, 404);
  }

  return c.json({ published: await isWorkspacePublished(record.id) });
});

workspaceRoutes.put("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  if (!(await canAccessWorkspace(record.id, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accessibleIds = await getAccessibleWorkspaceIds(
    record.organizationId,
    user.id,
  );
  const { databaseIds, workspaceIds } = await getNestedFavoriteTargetIds(
    record.id,
    record.organizationId,
    accessibleIds,
  );

  await db.transaction(async (tx) => {
    if (workspaceIds.length > 0) {
      await tx
        .insert(favorite)
        .values(
          workspaceIds.map((workspaceId) => ({
            id: crypto.randomUUID(),
            userId: user.id,
            workspaceId,
          })),
        )
        .onConflictDoNothing({
          target: [favorite.userId, favorite.workspaceId],
        });
    }

    if (databaseIds.length > 0) {
      await tx
        .insert(favorite)
        .values(
          databaseIds.map((databaseId) => ({
            databaseId,
            id: crypto.randomUUID(),
            userId: user.id,
          })),
        )
        .onConflictDoNothing({
          target: [favorite.userId, favorite.databaseId],
        });
    }
  });

  return c.json({ workspace: { ...record, isFavorite: true } });
});

workspaceRoutes.delete("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  if (!(await canAccessWorkspace(record.id, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accessibleIds = await getAccessibleWorkspaceIds(
    record.organizationId,
    user.id,
  );
  const { databaseIds, workspaceIds } = await getNestedFavoriteTargetIds(
    record.id,
    record.organizationId,
    accessibleIds,
  );

  await db.transaction(async (tx) => {
    if (workspaceIds.length > 0) {
      await tx
        .delete(favorite)
        .where(
          and(
            eq(favorite.userId, user.id),
            inArray(favorite.workspaceId, workspaceIds),
          ),
        );
    }

    if (databaseIds.length > 0) {
      await tx
        .delete(favorite)
        .where(
          and(
            eq(favorite.userId, user.id),
            inArray(favorite.databaseId, databaseIds),
          ),
        );
    }
  });

  return c.json({ workspace: { ...record, isFavorite: false } });
});

workspaceRoutes.get("/:id/access", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const accessLevel = await getEffectiveWorkspaceAccess(record.id, requestUser.id);

  if (!hasAccess(accessLevel, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rules = await db
    .select()
    .from(workspaceAccess)
    .where(eq(workspaceAccess.workspaceId, record.id))
    .orderBy(asc(workspaceAccess.createdAt));

  return c.json({ access: rules });
});

workspaceRoutes.get("/:id/access-targets", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const requestUserAccess = await getEffectiveWorkspaceAccess(
    record.id,
    requestUser.id,
  );

  if (!hasAccess(requestUserAccess, "view")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const members = await db
    .select({
      email: user.email,
      id: user.id,
      memberId: member.id,
      name: user.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, record.organizationId))
    .orderBy(asc(user.name), asc(user.email));

  const accessibleMembers = [];

  for (const targetMember of members) {
    const accessLevel = await getEffectiveWorkspaceAccess(
      record.id,
      targetMember.id,
    );

    if (hasAccess(accessLevel, "view")) {
      accessibleMembers.push(targetMember);
    }
  }

  return c.json({ members: accessibleMembers });
});

workspaceRoutes.put("/:id/access", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const currentAccess = await getEffectiveWorkspaceAccess(record.id, requestUser.id);

  if (!hasAccess(currentAccess, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { targetType, targetId, accessLevel } = body as {
    accessLevel?: unknown;
    targetId?: unknown;
    targetType?: unknown;
  };
  const normalizedAccessLevel = normalizeAccessLevel(accessLevel);

  if (targetType !== "public" && targetType !== "user" && targetType !== "team") {
    return c.json({ error: "targetType must be public, user, or team" }, 400);
  }

  if (typeof targetId !== "string" || targetId.length === 0) {
    return c.json({ error: "targetId is required" }, 400);
  }

  if (!normalizedAccessLevel) {
    return c.json({ error: "accessLevel must be view, edit, or full" }, 400);
  }

  if (targetType === "public") {
    if (targetId !== "*") {
      return c.json({ error: "public targetId must be *" }, 400);
    }

    if (normalizedAccessLevel !== "view") {
      return c.json({ error: "public access must be view" }, 400);
    }
  }

  const [target] =
    targetType === "public"
      ? [{ id: "*" }]
      : targetType === "user"
      ? await db
          .select({ id: member.id })
          .from(member)
          .where(
            and(
              eq(member.organizationId, record.organizationId),
              eq(member.userId, targetId),
            ),
          )
          .limit(1)
      : await db
          .select({ id: team.id })
          .from(team)
          .where(
            and(
              eq(team.organizationId, record.organizationId),
              eq(team.id, targetId),
            ),
          )
          .limit(1);

  if (!target) {
    return c.json({ error: "Target not found" }, 404);
  }

  const [rule] = await db
    .insert(workspaceAccess)
    .values({
      id: crypto.randomUUID(),
      accessLevel: normalizedAccessLevel,
      organizationId: record.organizationId,
      targetId,
      targetType,
      workspaceId: record.id,
    })
    .onConflictDoUpdate({
      target: [
        workspaceAccess.workspaceId,
        workspaceAccess.targetType,
        workspaceAccess.targetId,
      ],
      set: {
        accessLevel: normalizedAccessLevel,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json({ access: rule });
});

workspaceRoutes.delete("/:id/access/public", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const accessLevel = await getEffectiveWorkspaceAccess(record.id, requestUser.id);

  if (!hasAccess(accessLevel, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [rule] = await db
    .delete(workspaceAccess)
    .where(
      and(
        eq(workspaceAccess.workspaceId, record.id),
        eq(workspaceAccess.targetType, "public"),
        eq(workspaceAccess.targetId, "*"),
      ),
    )
    .returning();

  return c.json({ access: rule ?? null });
});

workspaceRoutes.delete("/:id/access/:ruleId", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const accessLevel = await getEffectiveWorkspaceAccess(record.id, requestUser.id);

  if (!hasAccess(accessLevel, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [rule] = await db
    .delete(workspaceAccess)
    .where(
      and(
        eq(workspaceAccess.id, c.req.param("ruleId")),
        eq(workspaceAccess.workspaceId, record.id),
      ),
    )
    .returning();

  if (!rule) {
    return c.json({ error: "Access rule not found" }, 404);
  }

  return c.json({ access: rule });
});

workspaceRoutes.get("/:id/properties", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  if (!(await canAccessWorkspace(record.id, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json(
    await getWorkspacePropertyPayload(record.id, record.organizationId),
  );
});

workspaceRoutes.put("/:id/properties/:propertyId/value", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getWorkspace(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  if (!(await canAccessWorkspace(record.id, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const propertyId = c.req.param("propertyId");
  const { value = null } = body as { value?: unknown };
  const propertyPayload = await getWorkspacePropertyPayload(
    record.id,
    record.organizationId,
  );
  const property = propertyPayload.properties.find(
    (item) => item.id === propertyId,
  );

  if (!property) {
    return c.json({ error: "Property not found" }, 404);
  }

  await db
    .insert(workspacePropertyValue)
    .values({
      id: crypto.randomUUID(),
      workspaceId: record.id,
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

  return c.json(
    await getWorkspacePropertyPayload(record.id, record.organizationId),
  );
});

workspaceRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getWorkspace(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  if (!(await canAccessWorkspace(existing.id, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const patch = body as {
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
  };
  const values: Partial<typeof workspace.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.type !== undefined) {
    if (typeof patch.type !== "string") {
      return c.json({ error: "type must be a string" }, 400);
    }

    values.type = patch.type;
  }

  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      return c.json({ error: "name must be a string" }, 400);
    }

    values.name = patch.name;
  }

  if (patch.url !== undefined) {
    if (typeof patch.url !== "string") {
      return c.json({ error: "url must be a string" }, 400);
    }

    values.url = patch.url;
  }

  if (patch.content !== undefined) {
    values.content = patch.content;
  }

  if (patch.metadata !== undefined) {
    if (
      patch.metadata &&
      typeof patch.metadata === "object" &&
      !Array.isArray(patch.metadata)
    ) {
      const parentWorkspaceId = (
        patch.metadata as { parentWorkspaceId?: unknown }
      ).parentWorkspaceId;

      if (parentWorkspaceId === existing.id) {
        return c.json({ error: "A workspace cannot be nested inside itself" }, 400);
      }

      if (
        typeof parentWorkspaceId === "string" &&
        parentWorkspaceId.length > 0 &&
        !(await canAccessWorkspace(parentWorkspaceId, user.id, "edit"))
      ) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    values.metadata = patch.metadata;
  }

  const [record] = await db
    .update(workspace)
    .set(values)
    .where(eq(workspace.id, existing.id))
    .returning();

  return c.json({ workspace: record });
});

workspaceRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getWorkspace(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  if (!(await canAccessWorkspace(existing.id, user.id, "full"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [record] = await db
    .update(workspace)
    .set({
      deletedAt: new Date(),
      deletedById: user.id,
      updatedAt: new Date(),
    })
    .where(eq(workspace.id, existing.id))
    .returning();

  return c.json({ workspace: record });
});
