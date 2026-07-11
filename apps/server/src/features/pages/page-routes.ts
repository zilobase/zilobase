import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  canAccessPageInWorkspace,
  getAccessiblePageIds,
  getEffectivePageAccessInWorkspace,
  getEffectivePageAccessForUsers,
  getMembership,
  getPageRecord,
  hasAccess,
  isPagePublishedInWorkspace,
  normalizeAccessLevel,
  rejectActiveWorkspaceMismatch,
  type AccessLevel,
} from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import { db } from "../../db";
import {
  database,
  databaseProperty,
  databaseRow,
  databaseView,
  favorite,
  itemVisit,
  member,
  team,
  user as userTable,
  page,
  pageAccess,
  pageItemPlacement,
  pageProperty,
  pagePropertyValue,
} from "../../db/schema";
import type { AppBindings } from "../../types";
import {
  addLinkedItem,
  clearParentItem,
  readMetadataRecord,
  readParentItemId,
  removeLinkedItem,
  resolveEmbedItem,
  wouldCreateParentCycle,
  type ItemRef,
} from "../../item-relationships";
import {
  buildNavigationPlacements,
  softDeletePageItemPlacement,
  upsertPageItemPlacement,
} from "../../page-item-placements";
import { softDeletePageTree } from "../../soft-delete-nav-items";
import { loadWorkspacePageGraph } from "../../page-graph";
import {
  createCollaborationTicket,
  documentNameForPage,
  replacePageContent,
} from "../../collaboration/service";
import { getCollaborationWebSocketUrl } from "../../runtime-adapter";
export const pageRoutes = new Hono<AppBindings>();

const NOTELAB_AI_MODES = new Set(["instruction", "skill"] as const);
type NotelabAiMode = "instruction" | "skill";

const parseNotelabAiModes = (
  value: string | undefined,
): NotelabAiMode[] | null => {
  if (!value) {
    return null;
  }

  const modes = value
    .split(",")
    .map((mode) => mode.trim())
    .filter((mode): mode is NotelabAiMode =>
      NOTELAB_AI_MODES.has(mode as NotelabAiMode),
    );

  if (modes.length === 0) {
    return null;
  }

  return [...new Set(modes)];
};

const readNotelabAiMode = (metadata: unknown): NotelabAiMode | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const mode = (metadata as { notelabai?: unknown }).notelabai;

  return typeof mode === "string" &&
    NOTELAB_AI_MODES.has(mode as NotelabAiMode)
    ? (mode as NotelabAiMode)
    : null;
};

const readPageEmoji = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const emoji = (metadata as { emoji?: unknown }).emoji;

  return typeof emoji === "string" ? emoji : null;
};

type PageListRecord = {
  id: string;
  metadata: unknown;
  name: string;
  workspaceId: string;
  updatedAt: Date;
  url: string;
};

const toNotelabAiPageSummary = (record: PageListRecord) => {
  const notelabai = readNotelabAiMode(record.metadata);

  return {
    id: record.id,
    name: record.name,
    workspaceId: record.workspaceId,
    updatedAt: record.updatedAt,
    url: record.url,
    metadata: {
      emoji: readPageEmoji(record.metadata),
      notelabai,
    },
  };
};

const getPage = getPageRecord;

const getPageIncludingDeleted = async (id: string) => {
  const [record] = await db
    .select()
    .from(page)
    .where(eq(page.id, id))
    .limit(1);

  return record ?? null;
};

const requireUser = (c: Context<AppBindings>) => {
  const user = c.get("user");

  if (!user) {
    return null;
  }

  return user;
};

const enforceActiveWorkspace = (
  c: Context<AppBindings>,
  workspaceId: string,
  userId: string,
) => rejectActiveWorkspaceMismatch(c, workspaceId, userId);

const getPagePropertyPayload = async (
  pageId: string,
  workspaceId: string,
) => {
  const [databaseProperties, values] = await Promise.all([
    db
      .select({ property: pageProperty })
      .from(databaseRow)
      .innerJoin(
        databaseProperty,
        eq(databaseRow.databaseId, databaseProperty.databaseId),
      )
      .innerJoin(
        pageProperty,
        eq(databaseProperty.propertyId, pageProperty.id),
      )
      .where(
        and(
          eq(databaseRow.pageId, pageId),
          eq(pageProperty.workspaceId, workspaceId),
          isNull(databaseRow.deletedAt),
          isNull(pageProperty.deletedAt),
        ),
      )
      .orderBy(asc(pageProperty.createdAt)),
    db
      .select()
      .from(pagePropertyValue)
      .where(eq(pagePropertyValue.pageId, pageId)),
  ]);

  const properties = Array.from(
    new Map(
      databaseProperties.map(({ property }) => [property.id, property]),
    ).values(),
  );
  return { properties, values };
};

const getNestedFavoriteTargetIds = async (
  rootPageId: string,
  workspaceId: string,
  accessibleIds: Set<string>,
) => {
  const graph = await loadWorkspacePageGraph(workspaceId);
  const pageIds = graph.getNestedPageIds(rootPageId, accessibleIds);

  return {
    databaseIds: graph.getDatabaseIdsForPageIds(pageIds, accessibleIds),
    pageIds,
  };
};

pageRoutes.get("/", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const notelabAiModes = parseNotelabAiModes(c.req.query("notelabai"));
  const isSummary = c.req.query("fields") === "summary";
  const deletedFilter = c.req.query("deleted") === "only" ? "only" : "active";
  const [accessibleIds, records] = await Promise.all([
    getAccessiblePageIds(workspaceId, user.id, {
      membershipVerified: true,
    }),
    db
      .select({
        id: page.id,
        workspaceId: page.workspaceId,
        createdById: page.createdById,
        type: page.type,
        name: page.name,
        url: page.url,
        metadata: page.metadata,
        deletedById: page.deletedById,
        deletedAt: page.deletedAt,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      })
      .from(page)
      .where(
        and(
          eq(page.workspaceId, workspaceId),
          deletedFilter === "only" ? undefined : isNull(page.deletedAt),
        ),
      ),
  ]);
  let accessibleRecords =
    deletedFilter === "only"
      ? records
      : records.filter((record) => accessibleIds.has(record.id));

  if (notelabAiModes) {
    accessibleRecords = accessibleRecords
      .filter((record) => {
        const mode = readNotelabAiMode(record.metadata);

        return Boolean(mode && notelabAiModes.includes(mode));
      })
      .sort(
        (first, second) =>
          second.updatedAt.getTime() - first.updatedAt.getTime(),
      );
  }

  if (isSummary) {
    return c.json({
      pages: accessibleRecords.map((record) =>
        toNotelabAiPageSummary(record),
      ),
    });
  }

  const [sharedPageRows, favoriteRows, visitRows, databaseRecords, placementRecords] =
    await Promise.all([
      db
        .select({ pageId: pageAccess.pageId })
        .from(pageAccess)
        .where(eq(pageAccess.workspaceId, workspaceId)),
      db
        .select({
          databaseId: favorite.databaseId,
          pageId: favorite.pageId,
        })
        .from(favorite)
        .where(eq(favorite.userId, user.id)),
      db
        .select({
          itemId: itemVisit.itemId,
          itemKind: itemVisit.itemKind,
          lastVisitedAt: itemVisit.lastVisitedAt,
        })
        .from(itemVisit)
        .where(
          and(
            eq(itemVisit.workspaceId, workspaceId),
            eq(itemVisit.userId, user.id),
          ),
        ),
      db
        .select()
        .from(database)
        .where(
          and(
            eq(database.workspaceId, workspaceId),
            deletedFilter === "only"
              ? isNotNull(database.deletedAt)
              : isNull(database.deletedAt),
          ),
        ),
      db
        .select()
        .from(pageItemPlacement)
        .where(
          and(
            eq(pageItemPlacement.workspaceId, workspaceId),
            isNull(pageItemPlacement.deletedAt),
          ),
        ),
    ]);
  const teamspaceIds = new Set(
    sharedPageRows.map((row) => row.pageId),
  );
  const favoritePageIds = new Set(
    favoriteRows
      .map((row) => row.pageId)
      .filter((pageId): pageId is string => Boolean(pageId)),
  );
  const favoriteDatabaseIds = new Set(
    favoriteRows
      .map((row) => row.databaseId)
      .filter((databaseId): databaseId is string => Boolean(databaseId)),
  );
  const visitsByKey = new Map(
    visitRows.map((visit) => [
      `${visit.itemKind}:${visit.itemId}`,
      visit.lastVisitedAt,
    ]),
  );

  const accessibleRecordIds = new Set(
    accessibleRecords.map((record) => record.id),
  );
  const activeDatabases = databaseRecords.filter((record) =>
    accessibleRecordIds.has(record.pageId),
  );
  const activeDatabaseIds = new Set(activeDatabases.map((record) => record.id));
  const databaseRowPages =
    activeDatabaseIds.size > 0
      ? await db
          .select({
            databaseId: databaseRow.databaseId,
            id: databaseRow.id,
            pageId: databaseRow.pageId,
            position: databaseRow.position,
          })
          .from(databaseRow)
          .where(
            and(
              inArray(databaseRow.databaseId, [...activeDatabaseIds]),
              isNull(databaseRow.deletedAt),
            ),
          )
      : [];
  const missingDatabaseRowPageIds = [
    ...new Set(
      databaseRowPages
        .map((row) => row.pageId)
        .filter((pageId) => !accessibleRecordIds.has(pageId)),
    ),
  ];

  if (deletedFilter === "active" && missingDatabaseRowPageIds.length > 0) {
    const deletedDatabaseRowPages = await db
      .select({
        id: page.id,
        workspaceId: page.workspaceId,
        createdById: page.createdById,
        type: page.type,
        name: page.name,
        url: page.url,
        metadata: page.metadata,
        deletedById: page.deletedById,
        deletedAt: page.deletedAt,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      })
      .from(page)
      .where(
        and(
          eq(page.workspaceId, workspaceId),
          inArray(page.id, missingDatabaseRowPageIds),
          isNotNull(page.deletedAt),
        ),
      );

    accessibleRecords = [...accessibleRecords, ...deletedDatabaseRowPages];

    for (const record of deletedDatabaseRowPages) {
      accessibleRecordIds.add(record.id);
    }
  }

  const creatorIds = [
    ...new Set(
      [
        ...accessibleRecords.flatMap((record) => [
          record.createdById,
          record.deletedById,
        ]),
        ...activeDatabases.map((record) => record.deletedById),
      ]
        .filter((createdById): createdById is string => Boolean(createdById)),
    ),
  ];
  const [creatorRows, databaseViews] = await Promise.all([
    creatorIds.length > 0
      ? db
          .select({
            email: userTable.email,
            id: userTable.id,
            image: userTable.image,
            name: userTable.name,
          })
          .from(userTable)
          .where(inArray(userTable.id, creatorIds))
      : Promise.resolve([]),
    activeDatabaseIds.size > 0
      ? db
          .select({
            config: databaseView.config,
            createdAt: databaseView.createdAt,
            databaseId: databaseView.databaseId,
            id: databaseView.id,
            name: databaseView.name,
            position: databaseView.position,
            type: databaseView.type,
            updatedAt: databaseView.updatedAt,
          })
          .from(databaseView)
          .where(inArray(databaseView.databaseId, [...activeDatabaseIds]))
      : Promise.resolve([]),
  ]);
  const creatorsById = new Map(creatorRows.map((creator) => [creator.id, creator]));
  const createdByByPageId = new Map(
    accessibleRecords.map((record) => [
      record.id,
      record.createdById ? creatorsById.get(record.createdById) ?? null : null,
    ]),
  );

  const viewsByDatabaseId = new Map<string, typeof databaseViews>();

  for (const view of databaseViews) {
    viewsByDatabaseId.set(view.databaseId, [
      ...(viewsByDatabaseId.get(view.databaseId) ?? []),
      view,
    ]);
  }
  type ActiveDatabasePayload = (typeof activeDatabases)[number] & {
    createdBy: (typeof creatorRows)[number] | null;
    deletedBy: (typeof creatorRows)[number] | null;
    isFavorite: boolean;
    lastVisitedAt: Date | null;
    views: typeof databaseViews;
  };
  const databasesByPageId = new Map<string, ActiveDatabasePayload[]>();

  for (const record of activeDatabases) {
    const views = [...(viewsByDatabaseId.get(record.id) ?? [])].sort(
      (first, second) => first.position - second.position,
    );

    databasesByPageId.set(record.pageId, [
      ...(databasesByPageId.get(record.pageId) ?? []),
      {
        ...record,
        createdBy: createdByByPageId.get(record.pageId) ?? null,
        deletedBy: record.deletedById
          ? creatorsById.get(record.deletedById) ?? null
          : null,
        isFavorite: favoriteDatabaseIds.has(record.id),
        lastVisitedAt: visitsByKey.get(`database:${record.id}`) ?? null,
        views,
      },
    ]);
  }
  const placements = buildNavigationPlacements({
    databaseRecords: activeDatabases,
    databaseRows: databaseRowPages.filter(
      (row) =>
        activeDatabaseIds.has(row.databaseId) &&
        accessibleRecordIds.has(row.pageId),
    ),
    placementRecords,
    pageRecords: accessibleRecords,
  });

  return c.json({
    placements,
    pages: accessibleRecords.map((record) => ({
      ...record,
      createdBy: record.createdById
        ? creatorsById.get(record.createdById) ?? null
        : null,
      deletedBy: record.deletedById
        ? creatorsById.get(record.deletedById) ?? null
        : null,
      databases: databasesByPageId.get(record.id) ?? [],
      isFavorite: favoritePageIds.has(record.id),
      isTeamspace: teamspaceIds.has(record.id),
      lastVisitedAt: visitsByKey.get(`page:${record.id}`) ?? null,
    })),
  });
});

pageRoutes.post("/item-visits", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { itemId, itemKind, workspaceId } = body as {
    itemId?: unknown;
    itemKind?: unknown;
    workspaceId?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  if (itemKind !== "page" && itemKind !== "database") {
    return c.json({ error: "itemKind must be page or database" }, 400);
  }

  if (typeof itemId !== "string" || itemId.length === 0) {
    return c.json({ error: "itemId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetPageId =
    itemKind === "page"
      ? itemId
      : (
          await db
            .select({ pageId: database.pageId })
            .from(database)
            .where(
              and(
                eq(database.id, itemId),
                eq(database.workspaceId, workspaceId),
                isNull(database.deletedAt),
              ),
            )
            .limit(1)
        )[0]?.pageId;

  if (!targetPageId) {
    return c.json({ error: "Item not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(
    targetPageId,
    workspaceId,
    user.id,
    "view",
  ))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const now = new Date();

  await db
    .insert(itemVisit)
    .values({
      id: crypto.randomUUID(),
      itemId,
      itemKind,
      workspaceId,
      userId: user.id,
      createdAt: now,
      lastVisitedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        lastVisitedAt: now,
        updatedAt: now,
      },
      target: [itemVisit.userId, itemVisit.itemKind, itemVisit.itemId],
    });

  return c.json({
    itemId,
    itemKind,
    lastVisitedAt: now,
  });
});

pageRoutes.post("/", async (c) => {
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
    type = "pageblock",
    name = "",
    url = "#",
    content = null,
    metadata = null,
  } = body as {
    workspaceId?: unknown;
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  if (typeof type !== "string" || typeof url !== "string") {
    return c.json({ error: "type and url must be strings" }, 400);
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const createOrgMismatch = await enforceActiveWorkspace(
    c,
    workspaceId,
    user.id,
  );

  if (createOrgMismatch) {
    return createOrgMismatch;
  }

  if (
    typeof metadata === "object" &&
    metadata &&
    !Array.isArray(metadata) &&
    typeof (metadata as { parentItemId?: unknown }).parentItemId === "string" &&
    !(await canAccessPageInWorkspace(
      (metadata as { parentItemId: string }).parentItemId,
      workspaceId,
      user.id,
      "edit",
    ))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const pageId = crypto.randomUUID();
  const parentItemId =
    typeof metadata === "object" &&
    metadata &&
    !Array.isArray(metadata) &&
    typeof (metadata as { parentItemId?: unknown }).parentItemId === "string"
      ? (metadata as { parentItemId: string }).parentItemId
      : null;
  const [parentFavorite] = parentItemId
    ? await db
        .select({ id: favorite.id })
        .from(favorite)
        .where(
          and(eq(favorite.userId, user.id), eq(favorite.pageId, parentItemId)),
        )
        .limit(1)
    : [];
  const shouldInheritFavorite = Boolean(parentFavorite);
  const placement = parentItemId
    ? {
        id: `legacy:primary:page:${parentItemId}:page:${pageId}:`,
        workspaceId,
        parentKind: "page" as const,
        parentId: parentItemId,
        itemKind: "page" as const,
        itemId: pageId,
        placementKind: "primary" as const,
        sourceRowId: null,
        position: 0,
      }
    : null;
  const [record] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(page)
      .values({
        id: pageId,
        workspaceId,
        createdById: user.id,
        type,
        name,
        url,
        content,
        metadata,
      })
      .returning();

    if (parentItemId) {
      await upsertPageItemPlacement(tx, {
        id: placement?.id,
        workspaceId,
        parentKind: "page",
        parentId: parentItemId,
        itemKind: "page",
        itemId: pageId,
        placementKind: "primary",
      });
    }

    if (shouldInheritFavorite) {
      await tx
        .insert(favorite)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          pageId,
        })
        .onConflictDoNothing({
          target: [favorite.userId, favorite.pageId],
        });
    }

    return [created];
  });

  const pagePayload = { ...record, isFavorite: shouldInheritFavorite };

  return c.json(
    {
      navDelta: {
        upsertPlacements: placement ? [placement] : [],
        upsertPages: [pagePayload],
      },
      page: pagePayload,
    },
    201,
  );
});

pageRoutes.post("/:id/embed-item", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hostId = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { itemId, kind } = body as {
    itemId?: unknown;
    kind?: unknown;
  };

  if (typeof itemId !== "string" || itemId.length === 0) {
    return c.json({ error: "itemId is required" }, 400);
  }

  if (kind !== "page" && kind !== "database") {
    return c.json({ error: "kind must be page or database" }, 400);
  }

  const [host] = await db
    .select()
    .from(page)
    .where(and(eq(page.id, hostId), isNull(page.deletedAt)))
    .limit(1);

  if (!host) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(host.id, host.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const embedOrgMismatch = await enforceActiveWorkspace(
    c,
    host.workspaceId,
    user.id,
  );

  if (embedOrgMismatch) {
    return embedOrgMismatch;
  }

  if (kind === "page") {
    if (itemId === host.id) {
      return c.json({ error: "A page cannot be nested inside itself" }, 400);
    }

    const [child] = await db
      .select()
      .from(page)
      .where(
        and(
          eq(page.id, itemId),
          eq(page.workspaceId, host.workspaceId),
          isNull(page.deletedAt),
        ),
      )
      .limit(1);

    if (!child) {
      return c.json({ error: "Page not found" }, 404);
    }

    if (!(await canAccessPageInWorkspace(child.id, child.workspaceId, user.id, "view"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const [sourceDatabaseRow] = await db
      .select({ id: databaseRow.id })
      .from(databaseRow)
      .where(and(eq(databaseRow.pageId, child.id), isNull(databaseRow.deletedAt)))
      .limit(1);

    const orgPages = await db
      .select({ id: page.id, metadata: page.metadata })
      .from(page)
      .where(
        and(
          eq(page.workspaceId, host.workspaceId),
          isNull(page.deletedAt),
        ),
      );
    const metadataByPageId = new Map(
      orgPages.map((record) => [record.id, record.metadata]),
    );

    if (
      wouldCreateParentCycle({
        childId: child.id,
        parentId: host.id,
        getParentItemId: (pageId) => {
          if (pageId === child.id) {
            return host.id;
          }

          return readParentItemId(metadataByPageId.get(pageId));
        },
      })
    ) {
      return c.json({ error: "Embedding would create a cycle" }, 400);
    }

    const resolved = resolveEmbedItem({
      childId: child.id,
      childMetadata: child.metadata,
      hostId: host.id,
      hostMetadata: host.metadata,
      kind: "page",
    });
    const childParentItemId = readParentItemId(child.metadata);
    const shouldLinkDatabaseRowPage =
      Boolean(sourceDatabaseRow) &&
      resolved.action === "setParent" &&
      !childParentItemId;

    await db.transaction(async (tx) => {
      if (resolved.action === "setParent" && !shouldLinkDatabaseRowPage) {
        await tx
          .update(page)
          .set({
            metadata: resolved.childMetadata,
            updatedAt: new Date(),
          })
          .where(eq(page.id, child.id));
        await upsertPageItemPlacement(tx, {
          workspaceId: host.workspaceId,
          parentKind: "page",
          parentId: host.id,
          itemKind: "page",
          itemId: child.id,
          placementKind: "primary",
        });
      } else {
        const hostMetadata =
          resolved.action === "addLink"
            ? resolved.hostMetadata
            : addLinkedItem(readMetadataRecord(host.metadata), {
                id: child.id,
                kind: "page",
              });

        await tx
          .update(page)
          .set({
            metadata: hostMetadata,
            updatedAt: new Date(),
          })
          .where(eq(page.id, host.id));
        await upsertPageItemPlacement(tx, {
          workspaceId: host.workspaceId,
          parentKind: "page",
          parentId: host.id,
          itemKind: "page",
          itemId: child.id,
          placementKind: "linked",
        });
      }
    });

    const [updatedHost] = await db
      .select()
      .from(page)
      .where(eq(page.id, host.id))
      .limit(1);

    return c.json({
      action: shouldLinkDatabaseRowPage ? "addLink" : resolved.action,
      host: updatedHost,
    });
  }

  const [databaseRecord] = await db
    .select()
    .from(database)
    .where(
      and(
        eq(database.id, itemId),
        eq(database.workspaceId, host.workspaceId),
        isNull(database.deletedAt),
      ),
    )
    .limit(1);

  if (!databaseRecord) {
    return c.json({ error: "Database not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(
    databaseRecord.pageId,
    databaseRecord.workspaceId,
    user.id,
    "view",
  ))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (databaseRecord.pageId === host.id) {
    return c.json({
      action: "setParent",
      host,
    });
  }

  const hostMetadata = addLinkedItem(
    readMetadataRecord(host.metadata),
    { id: databaseRecord.id, kind: "database" },
  );

  const [updatedHost] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(page)
      .set({
        metadata: hostMetadata,
        updatedAt: new Date(),
      })
      .where(eq(page.id, host.id))
      .returning();

    await upsertPageItemPlacement(tx, {
      workspaceId: host.workspaceId,
      parentKind: "page",
      parentId: host.id,
      itemKind: "database",
      itemId: databaseRecord.id,
      placementKind: "linked",
    });

    return [updated];
  });

  return c.json({
    action: "addLink",
    host: updatedHost ?? null,
  });
});

pageRoutes.delete("/:id/embed-item", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hostId = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { itemId, kind } = body as {
    itemId?: unknown;
    kind?: unknown;
  };

  if (typeof itemId !== "string" || itemId.length === 0) {
    return c.json({ error: "itemId is required" }, 400);
  }

  if (kind !== "page" && kind !== "database") {
    return c.json({ error: "kind must be page or database" }, 400);
  }

  const [host] = await db
    .select()
    .from(page)
    .where(and(eq(page.id, hostId), isNull(page.deletedAt)))
    .limit(1);

  if (!host) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(host.id, host.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const unembedOrgMismatch = await enforceActiveWorkspace(
    c,
    host.workspaceId,
    user.id,
  );

  if (unembedOrgMismatch) {
    return unembedOrgMismatch;
  }

  const ref: ItemRef = { id: itemId, kind };

  if (kind === "page") {
    const [child] = await db
      .select()
      .from(page)
      .where(
        and(
          eq(page.id, itemId),
          eq(page.workspaceId, host.workspaceId),
          isNull(page.deletedAt),
        ),
      )
      .limit(1);

    if (!child) {
      return c.json({ error: "Page not found" }, 404);
    }

    if (readParentItemId(child.metadata) === host.id) {
      await db.transaction(async (tx) => {
        await tx
          .update(page)
          .set({
            metadata: clearParentItem(readMetadataRecord(child.metadata)),
            updatedAt: new Date(),
          })
          .where(eq(page.id, child.id));
        await softDeletePageItemPlacement(tx, {
          workspaceId: host.workspaceId,
          parentKind: "page",
          parentId: host.id,
          item: ref,
        });
      });

      return c.json({ action: "clearParent" });
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(page)
      .set({
        metadata: removeLinkedItem(readMetadataRecord(host.metadata), ref),
        updatedAt: new Date(),
      })
      .where(eq(page.id, host.id));
    await softDeletePageItemPlacement(tx, {
      workspaceId: host.workspaceId,
      parentKind: "page",
      parentId: host.id,
      item: ref,
    });
  });

  return c.json({ action: "removeLink" });
});

pageRoutes.get("/:id", async (c) => {
  const user = requireUser(c);

  const record = await getPageIncludingDeleted(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  let accessLevel: AccessLevel = "none";

  if (record.deletedAt && user) {
    accessLevel = (await getMembership(record.workspaceId, user.id))
      ? "full"
      : "none";
  } else if (user) {
    accessLevel = await getEffectivePageAccessInWorkspace(
      record.id,
      record.workspaceId,
      user.id,
    );
  }

  if (!hasAccess(accessLevel, "view")) {
    const published = await isPagePublishedInWorkspace(
      record.id,
      record.workspaceId,
    );

    if (!published) {
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      return c.json({ error: "Forbidden" }, 403);
    }
  }

  if (user && hasAccess(accessLevel, "view")) {
    const pageOrgMismatch = await enforceActiveWorkspace(
      c,
      record.workspaceId,
      user.id,
    );

    if (pageOrgMismatch) {
      return pageOrgMismatch;
    }
  }

  const [favoriteRecord] = user
    ? await db
        .select({ id: favorite.id })
        .from(favorite)
        .where(
          and(
            eq(favorite.userId, user.id),
            eq(favorite.pageId, record.id),
          ),
        )
        .limit(1)
    : [];

  return c.json({
    accessLevel: hasAccess(accessLevel, "view") ? accessLevel : "view",
    page: { ...record, isFavorite: Boolean(favoriteRecord) },
  });
});

pageRoutes.get("/:id/published", async (c) => {
  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ published: false }, 404);
  }

  return c.json({
    published: await isPagePublishedInWorkspace(record.id, record.workspaceId),
  });
});

pageRoutes.put("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const favoriteOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    user.id,
  );

  if (favoriteOrgMismatch) {
    return favoriteOrgMismatch;
  }

  await db
    .insert(favorite)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      pageId: record.id,
    })
    .onConflictDoNothing({
      target: [favorite.userId, favorite.pageId],
    });

  return c.json({ page: { ...record, isFavorite: true } });
});

pageRoutes.delete("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const unfavoriteOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    user.id,
  );

  if (unfavoriteOrgMismatch) {
    return unfavoriteOrgMismatch;
  }

  await db
    .delete(favorite)
    .where(and(eq(favorite.userId, user.id), eq(favorite.pageId, record.id)));

  return c.json({ page: { ...record, isFavorite: false } });
});

pageRoutes.get("/:id/access", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  const accessLevel = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    requestUser.id,
  );

  if (!hasAccess(accessLevel, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const listAccessOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    requestUser.id,
  );

  if (listAccessOrgMismatch) {
    return listAccessOrgMismatch;
  }

  const rules = await db
    .select()
    .from(pageAccess)
    .where(eq(pageAccess.pageId, record.id))
    .orderBy(asc(pageAccess.createdAt));

  return c.json({ access: rules });
});

pageRoutes.get("/:id/access-targets", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  const requestUserAccess = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    requestUser.id,
  );

  if (!hasAccess(requestUserAccess, "view")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accessTargetsOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    requestUser.id,
  );

  if (accessTargetsOrgMismatch) {
    return accessTargetsOrgMismatch;
  }

  const members = await db
    .select({
      email: userTable.email,
      id: userTable.id,
      memberId: member.id,
      name: userTable.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(userTable, eq(member.userId, userTable.id))
    .where(eq(member.organizationId, record.workspaceId))
    .orderBy(asc(userTable.name), asc(userTable.email));

  const accessByUserId = await getEffectivePageAccessForUsers(
    record.id,
    record.workspaceId,
    members.map((targetMember) => targetMember.id),
  );
  const accessibleMembers = members.filter((targetMember) =>
    hasAccess(accessByUserId.get(targetMember.id) ?? "none", "view"),
  );

  return c.json({ members: accessibleMembers });
});

pageRoutes.put("/:id/access", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  const currentAccess = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    requestUser.id,
  );

  if (!hasAccess(currentAccess, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const putAccessOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    requestUser.id,
  );

  if (putAccessOrgMismatch) {
    return putAccessOrgMismatch;
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
              eq(member.organizationId, record.workspaceId),
              eq(member.userId, targetId),
            ),
          )
          .limit(1)
      : await db
          .select({ id: team.id })
          .from(team)
          .where(
            and(
              eq(team.organizationId, record.workspaceId),
              eq(team.id, targetId),
            ),
          )
          .limit(1);

  if (!target) {
    return c.json({ error: "Target not found" }, 404);
  }

  const [rule] = await db
    .insert(pageAccess)
    .values({
      id: crypto.randomUUID(),
      accessLevel: normalizedAccessLevel,
      workspaceId: record.workspaceId,
      targetId,
      targetType,
      pageId: record.id,
    })
    .onConflictDoUpdate({
      target: [
        pageAccess.pageId,
        pageAccess.targetType,
        pageAccess.targetId,
      ],
      set: {
        accessLevel: normalizedAccessLevel,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json({ access: rule });
});

pageRoutes.delete("/:id/access/public", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  const accessLevel = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    requestUser.id,
  );

  if (!hasAccess(accessLevel, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const deletePublicAccessOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    requestUser.id,
  );

  if (deletePublicAccessOrgMismatch) {
    return deletePublicAccessOrgMismatch;
  }

  const [rule] = await db
    .delete(pageAccess)
    .where(
      and(
        eq(pageAccess.pageId, record.id),
        eq(pageAccess.targetType, "public"),
        eq(pageAccess.targetId, "*"),
      ),
    )
    .returning();

  return c.json({ access: rule ?? null });
});

pageRoutes.delete("/:id/access/:ruleId", async (c) => {
  const requestUser = requireUser(c);

  if (!requestUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  const accessLevel = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    requestUser.id,
  );

  if (!hasAccess(accessLevel, "full")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const deleteAccessOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    requestUser.id,
  );

  if (deleteAccessOrgMismatch) {
    return deleteAccessOrgMismatch;
  }

  const [rule] = await db
    .delete(pageAccess)
    .where(
      and(
        eq(pageAccess.id, c.req.param("ruleId")),
        eq(pageAccess.pageId, record.id),
      ),
    )
    .returning();

  if (!rule) {
    return c.json({ error: "Access rule not found" }, 404);
  }

  return c.json({ access: rule });
});

pageRoutes.get("/:id/properties", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "view"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const propertiesOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    user.id,
  );

  if (propertiesOrgMismatch) {
    return propertiesOrgMismatch;
  }

  return c.json(
    await getPagePropertyPayload(record.id, record.workspaceId),
  );
});

pageRoutes.put("/:id/properties/:propertyId/value", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const propertyValueOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    user.id,
  );

  if (propertyValueOrgMismatch) {
    return propertyValueOrgMismatch;
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const propertyId = c.req.param("propertyId");
  const { value = null } = body as { value?: unknown };
  const propertyPayload = await getPagePropertyPayload(
    record.id,
    record.workspaceId,
  );
  const property = propertyPayload.properties.find(
    (item) => item.id === propertyId,
  );

  if (!property) {
    return c.json({ error: "Property not found" }, 404);
  }

  await db
    .insert(pagePropertyValue)
    .values({
      id: crypto.randomUUID(),
      pageId: record.id,
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
        updatedAt: new Date(),
      },
    });

  return c.json(
    await getPagePropertyPayload(record.id, record.workspaceId),
  );
});

pageRoutes.post("/:id/collaboration-ticket", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.id, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const workspaceMismatch = await enforceActiveWorkspace(
    c,
    existing.workspaceId,
    user.id,
  );

  if (workspaceMismatch) {
    return workspaceMismatch;
  }

  const ticket = await createCollaborationTicket(
    {
      pageId: existing.id,
      userId: user.id,
      workspaceId: existing.workspaceId,
    },
    c.env,
  );
  const documentName = documentNameForPage(existing.id);
  const websocketUrl = new URL(
    getCollaborationWebSocketUrl(c.req.raw, c.env),
  );
  websocketUrl.searchParams.set("document", documentName);

  return c.json({
    documentName,
    websocketUrl: websocketUrl.toString(),
    ...ticket,
  });
});

pageRoutes.patch("/:id/content", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.id, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const patchOrgMismatch = await enforceActiveWorkspace(
    c,
    existing.workspaceId,
    user.id,
  );

  if (patchOrgMismatch) {
    return patchOrgMismatch;
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { content, baseUpdatedAt } = body as {
    baseUpdatedAt?: unknown;
    content?: unknown;
  };

  if (!("content" in body)) {
    return c.json({ error: "content is required" }, 400);
  }

  if (baseUpdatedAt !== undefined) {
    if (typeof baseUpdatedAt !== "string") {
      return c.json({ error: "baseUpdatedAt must be a string" }, 400);
    }

    const baseUpdatedAtDate = new Date(baseUpdatedAt);

    if (Number.isNaN(baseUpdatedAtDate.getTime())) {
      return c.json({ error: "baseUpdatedAt must be a valid date" }, 400);
    }

    if (baseUpdatedAtDate.toISOString() !== existing.updatedAt.toISOString()) {
      return c.json(
        {
          error: "Page content was updated by another request.",
          page: {
            id: existing.id,
            updatedAt: existing.updatedAt,
          },
        },
        409,
      );
    }
  }

  await replacePageContent({
    content,
    env: c.env,
    pageId: existing.id,
    userId: user.id,
  });

  const record = {
    id: existing.id,
    updatedAt: new Date(),
  };

  return c.json({ page: record });
});

pageRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.id, existing.workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const patchOrgMismatch = await enforceActiveWorkspace(
    c,
    existing.workspaceId,
    user.id,
  );

  if (patchOrgMismatch) {
    return patchOrgMismatch;
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
  const values: Partial<typeof page.$inferInsert> = {
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

  if (patch.metadata !== undefined) {
    if (
      patch.metadata &&
      typeof patch.metadata === "object" &&
      !Array.isArray(patch.metadata)
    ) {
      const parentItemId = (patch.metadata as { parentItemId?: unknown })
        .parentItemId;

      if (parentItemId === existing.id) {
        return c.json({ error: "A page cannot be nested inside itself" }, 400);
      }

      if (
        typeof parentItemId === "string" &&
        parentItemId.length > 0 &&
        !(await canAccessPageInWorkspace(
          parentItemId,
          existing.workspaceId,
          user.id,
          "edit",
        ))
      ) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    values.metadata = patch.metadata;
  }

  const [record] = await db
    .update(page)
    .set(values)
    .where(eq(page.id, existing.id))
    .returning();

  if (patch.content !== undefined) {
    await replacePageContent({
      content: patch.content,
      env: c.env,
      pageId: existing.id,
      userId: user.id,
    });
    record.content = patch.content;
  }

  return c.json({ page: record });
});

pageRoutes.post("/:id/restore", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPageIncludingDeleted(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await getMembership(existing.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const restoreOrgMismatch = await enforceActiveWorkspace(
    c,
    existing.workspaceId,
    user.id,
  );

  if (restoreOrgMismatch) {
    return restoreOrgMismatch;
  }

  const [record] = await db
    .update(page)
    .set({
      deletedAt: null,
      deletedById: null,
      updatedAt: new Date(),
    })
    .where(eq(page.id, existing.id))
    .returning();

  return c.json({ page: record });
});

pageRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.id, existing.workspaceId, user.id, "full"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const deleteOrgMismatch = await enforceActiveWorkspace(
    c,
    existing.workspaceId,
    user.id,
  );

  if (deleteOrgMismatch) {
    return deleteOrgMismatch;
  }

  const { deletedDatabaseIds, deletedPageIds } =
    await softDeletePageTree({
      workspaceId: existing.workspaceId,
      rootPageId: existing.id,
      userId: user.id,
    });

  const [record] = await db
    .select()
    .from(page)
    .where(eq(page.id, existing.id))
    .limit(1);

  return c.json({
    deletedDatabaseIds,
    deletedPageIds,
    page: record,
  });
});
