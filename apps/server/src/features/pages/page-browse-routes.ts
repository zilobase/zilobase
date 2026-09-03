import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { getAuthenticatedUser as requireUser } from "../../shared/http/auth";
import { canAccessDatabaseInWorkspace, getAccessiblePageIds, getEffectivePageAccessInWorkspace, getMembership, getWorkspacePrincipalKind, hasAccess, isPagePublishedInWorkspace, type AccessLevel } from "../access";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import { db } from "../../infrastructure/database";
import { database, dataSource, databaseDataSource, databaseRow, databaseView, favorite, itemVisit, user as userTable, page, pageAccess, pageItemPlacement, pageSettings } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { buildNavigationPlacements } from "./placements/page-item-placements";
import { parseZilobaseAiModes, readZilobaseAiMode, toZilobaseAiPageSummary } from "./page-ai-metadata";
import { enforceActiveWorkspace, getPage, getPageIncludingDeleted } from "./page-route-support";

export const pageBrowseRoutes = new Hono<AppBindings>();
export const pageBrowseDetailRoutes = new Hono<AppBindings>();

pageBrowseRoutes.get("/", async (c) => {
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

  const zilobaseAiModes = parseZilobaseAiModes(c.req.query("zilobaseai"));
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
        hasContent: page.hasContent,
        metadata: page.metadata,
        teamspaceId: page.teamspaceId,
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

  if (zilobaseAiModes) {
    accessibleRecords = accessibleRecords
      .filter((record) => {
        const mode = readZilobaseAiMode(record.metadata);

        return Boolean(mode && zilobaseAiModes.includes(mode));
      })
      .sort(
        (first, second) =>
          second.updatedAt.getTime() - first.updatedAt.getTime(),
      );
  }

  if (isSummary) {
    return c.json({
      pages: accessibleRecords.map((record) => toZilobaseAiPageSummary(record)),
    });
  }

  const [
    sharedPageRows,
    favoriteRows,
    visitRows,
    databaseRecords,
    placementRecords,
  ] = await Promise.all([
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

  const standaloneDatabaseRecords = (
    await Promise.all(
      databaseRecords
        .filter((record) => !record.pageId)
        .map(async (record) => ({
          record,
          visible:
            deletedFilter === "only"
              ? Boolean(record.deletedAt)
              : await canAccessDatabaseInWorkspace(
                  record.id,
                  record.workspaceId,
                  user.id,
                  "view",
                ),
        })),
    )
  ).filter(({ visible }) => visible);
  const standaloneDatabaseIds = new Set(
    standaloneDatabaseRecords.map(({ record }) => record.id),
  );
  const navigationDatabaseRecords = databaseRecords.filter(
    (record) => Boolean(record.pageId) || standaloneDatabaseIds.has(record.id),
  );

  if (deletedFilter === "only") {
    const accessibleRecordIds = new Set(
      accessibleRecords.map((record) => record.id),
    );
    const missingDatabaseHostPageIds = [
      ...new Set(
        navigationDatabaseRecords
          .map((record) => record.pageId)
          .filter((pageId): pageId is string =>
            Boolean(pageId && !accessibleRecordIds.has(pageId)),
          ),
      ),
    ];

    if (missingDatabaseHostPageIds.length > 0) {
      const databaseHostPages = await db
        .select({
          id: page.id,
          workspaceId: page.workspaceId,
          createdById: page.createdById,
          type: page.type,
          name: page.name,
          url: page.url,
          hasContent: page.hasContent,
          metadata: page.metadata,
          teamspaceId: page.teamspaceId,
          deletedById: page.deletedById,
          deletedAt: page.deletedAt,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        })
        .from(page)
        .where(
          and(
            eq(page.workspaceId, workspaceId),
            inArray(page.id, missingDatabaseHostPageIds),
          ),
        );

      accessibleRecords = [...accessibleRecords, ...databaseHostPages];
    }
  }

  const sharedPageIds = new Set(sharedPageRows.map((row) => row.pageId));
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
  const activeDatabases = navigationDatabaseRecords.filter((record) =>
    record.pageId
      ? accessibleRecordIds.has(record.pageId)
      : standaloneDatabaseIds.has(record.id),
  );
  const activeDatabaseIds = new Set(activeDatabases.map((record) => record.id));
  const databaseRowPages =
    activeDatabaseIds.size > 0
      ? await db
          .select({
            databaseId: dataSource.parentDatabaseId,
            id: databaseRow.id,
            pageId: databaseRow.pageId,
            position: databaseRow.position,
          })
          .from(databaseRow)
          .innerJoin(dataSource, eq(databaseRow.dataSourceId, dataSource.id))
          .where(
            and(
              inArray(dataSource.parentDatabaseId, [...activeDatabaseIds]),
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
        hasContent: page.hasContent,
        metadata: page.metadata,
        teamspaceId: page.teamspaceId,
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
        ...activeDatabases.map((record) => record.createdById),
      ].filter((createdById): createdById is string => Boolean(createdById)),
    ),
  ];
  const [creatorRows, databaseViews, databaseSourceLinks] = await Promise.all([
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
            dataSourceId: databaseView.dataSourceId,
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
    activeDatabaseIds.size > 0
      ? db
          .select({
            config: dataSource.config,
            databaseId: databaseDataSource.databaseId,
            parentDatabaseId: dataSource.parentDatabaseId,
            position: databaseDataSource.position,
          })
          .from(databaseDataSource)
          .innerJoin(
            dataSource,
            eq(databaseDataSource.dataSourceId, dataSource.id),
          )
          .where(
            and(
              inArray(databaseDataSource.databaseId, [...activeDatabaseIds]),
              isNull(dataSource.deletedAt),
            ),
          )
          .orderBy(asc(databaseDataSource.position))
      : Promise.resolve([]),
  ]);
  const creatorsById = new Map(
    creatorRows.map((creator) => [creator.id, creator]),
  );
  const createdByByPageId = new Map(
    accessibleRecords.map((record) => [
      record.id,
      record.createdById
        ? (creatorsById.get(record.createdById) ?? null)
        : null,
    ]),
  );

  const viewsByDatabaseId = new Map<string, typeof databaseViews>();

  for (const view of databaseViews) {
    viewsByDatabaseId.set(view.databaseId, [
      ...(viewsByDatabaseId.get(view.databaseId) ?? []),
      view,
    ]);
  }
  const primarySourceByDatabaseId = new Map<
    string,
    (typeof databaseSourceLinks)[number]
  >();

  for (const sourceLink of databaseSourceLinks) {
    const current = primarySourceByDatabaseId.get(sourceLink.databaseId);
    const isOwned = sourceLink.parentDatabaseId === sourceLink.databaseId;
    const currentIsOwned = current?.parentDatabaseId === current?.databaseId;

    if (!current || (isOwned && !currentIsOwned)) {
      primarySourceByDatabaseId.set(sourceLink.databaseId, sourceLink);
    }
  }
  type ActiveDatabasePayload = (typeof activeDatabases)[number] & {
    createdBy: (typeof creatorRows)[number] | null;
    dataSourceConfig: unknown;
    deletedBy: (typeof creatorRows)[number] | null;
    isFavorite: boolean;
    lastVisitedAt: Date | null;
    views: typeof databaseViews;
  };
  const databasePayloads: ActiveDatabasePayload[] = [];

  for (const record of activeDatabases) {
    const views = [...(viewsByDatabaseId.get(record.id) ?? [])].sort(
      (first, second) => first.position - second.position,
    );

    databasePayloads.push({
      ...record,
      createdBy: record.createdById
        ? (creatorsById.get(record.createdById) ?? null)
        : null,
      deletedBy: record.deletedById
        ? (creatorsById.get(record.deletedById) ?? null)
        : null,
      isFavorite: favoriteDatabaseIds.has(record.id),
      lastVisitedAt: visitsByKey.get(`database:${record.id}`) ?? null,
      dataSourceConfig:
        primarySourceByDatabaseId.get(record.id)?.config ?? null,
      views,
    });
  }
  const placements = buildNavigationPlacements({
    placementRecords,
  });

  return c.json({
    databases: databasePayloads,
    placements,
    pages: accessibleRecords.map((record) => ({
      ...record,
      createdBy: record.createdById
        ? (creatorsById.get(record.createdById) ?? null)
        : null,
      deletedBy: record.deletedById
        ? (creatorsById.get(record.deletedById) ?? null)
        : null,
      isFavorite: favoritePageIds.has(record.id),
      isShared: sharedPageIds.has(record.id),
      lastVisitedAt: visitsByKey.get(`page:${record.id}`) ?? null,
    })),
  });
});


pageBrowseDetailRoutes.get("/:id", async (c) => {
  const user = requireUser(c);

  const record = await getPageIncludingDeleted(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  let accessLevel: AccessLevel = "none";
  let usesPublishedFallback = false;

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

    usesPublishedFallback = true;
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

  const [
    favoriteRecords,
    parentPlacements,
    ownerSettingsRecords,
    databaseMemberships,
  ] =
    await Promise.all([
      user
        ? db
            .select({ id: favorite.id })
            .from(favorite)
            .where(
              and(
                eq(favorite.userId, user.id),
                eq(favorite.pageId, record.id),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
      db
        .select({ parentId: pageItemPlacement.parentId })
        .from(pageItemPlacement)
        .where(
          and(
            eq(pageItemPlacement.workspaceId, record.workspaceId),
            eq(pageItemPlacement.itemKind, "page"),
            eq(pageItemPlacement.itemId, record.id),
            eq(pageItemPlacement.placementKind, "primary"),
            isNull(pageItemPlacement.deletedAt),
          ),
        )
        .limit(1),
      usesPublishedFallback && record.createdById
        ? db
            .select({ pageFullWidth: pageSettings.pageFullWidth })
            .from(pageSettings)
            .where(eq(pageSettings.userId, record.createdById))
            .limit(1)
        : Promise.resolve([]),
      user && hasAccess(accessLevel, "view")
        ? db
            .selectDistinct({ databaseId: dataSource.parentDatabaseId })
            .from(databaseRow)
            .innerJoin(dataSource, eq(databaseRow.dataSourceId, dataSource.id))
            .innerJoin(database, eq(dataSource.parentDatabaseId, database.id))
            .where(
              and(
                eq(databaseRow.pageId, record.id),
                isNull(databaseRow.deletedAt),
                isNull(database.deletedAt),
              ),
            )
        : Promise.resolve([]),
    ]);
  const [favoriteRecord] = favoriteRecords;
  const [parentPlacement] = parentPlacements;
  const [ownerSettings] = ownerSettingsRecords;
  const databaseIds = user
    ? (
        await Promise.all(
          databaseMemberships.map(async ({ databaseId }) =>
            (await canAccessDatabaseInWorkspace(
              databaseId,
              record.workspaceId,
              user.id,
              "view",
            ))
              ? databaseId
              : null,
          ),
        )
      ).filter((databaseId): databaseId is string => Boolean(databaseId))
    : [];
  const viewerType = usesPublishedFallback
    ? "public"
    : user && hasAccess(accessLevel, "view")
      ? await getWorkspacePrincipalKind(record.workspaceId, user.id)
      : "public";

  return c.json({
    accessLevel: hasAccess(accessLevel, "view") ? accessLevel : "view",
    databaseIds,
    viewerType,
    page: {
      ...record,
      publishedOwnerPreferences: usesPublishedFallback
        ? { pageFullWidth: ownerSettings?.pageFullWidth ?? false }
        : null,
      isFavorite: Boolean(favoriteRecord),
      parentPageId: parentPlacement?.parentId ?? null,
    },
  });
});

pageBrowseDetailRoutes.get("/:id/published", async (c) => {
  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ published: false }, 404);
  }

  return c.json({
    published: await isPagePublishedInWorkspace(record.id, record.workspaceId),
  });
});
