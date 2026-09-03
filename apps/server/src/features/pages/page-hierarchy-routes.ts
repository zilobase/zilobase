import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { getAuthenticatedUser as requireUser } from "../../shared/http/auth";
import { hasPageBodyContent } from "@zilobase/features/pages/content-state";
import { canAccessDatabaseInWorkspace, canAccessPageInWorkspace, getEffectiveTeamspaceAccessInWorkspace, getMembership, hasAccess } from "../access";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import { db } from "../../infrastructure/database";
import { database, databaseRow, favorite, page, pageCollaborationDocument, pageItemPlacement } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { softDeletePageItemPlacement, upsertPageItemPlacement, type ItemRef } from "./placements/page-item-placements";
import { loadWorkspacePageGraph } from "./graph/loader";
import { encodePageContentAsYjs } from "../collaboration/service";
import { enqueueNavigationInvalidation, publishCommittedNavigationInvalidation } from "../workspaces/navigation-realtime/outbox";
import { TeamspaceManagementService } from "../teamspaces/management";
import { enforceActiveWorkspace, getPage } from "./page-route-support";

export const pageHierarchyRoutes = new Hono<AppBindings>();

pageHierarchyRoutes.post("/", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

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
    parentItemId = null,
    teamspaceId = null,
  } = body as {
    workspaceId?: unknown;
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
    parentItemId?: unknown;
    teamspaceId?: unknown;
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

  if (parentItemId === null && !(await getMembership(workspaceId, user.id))) {
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

  if (parentItemId !== null && typeof parentItemId !== "string") {
    return c.json({ error: "parentItemId must be a string or null" }, 400);
  }

  if (teamspaceId !== null && typeof teamspaceId !== "string") {
    return c.json({ error: "teamspaceId must be a string or null" }, 400);
  }

  if (
    typeof parentItemId === "string" &&
    !(await canAccessPageInWorkspace(
      parentItemId,
      workspaceId,
      user.id,
      "edit",
    ))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [parentRecord] =
    typeof parentItemId === "string"
      ? await db
          .select({ teamspaceId: page.teamspaceId })
          .from(page)
          .where(
            and(
              eq(page.id, parentItemId),
              eq(page.workspaceId, workspaceId),
              isNull(page.deletedAt),
            ),
          )
          .limit(1)
      : [];
  const resolvedTeamspaceId = parentRecord?.teamspaceId ?? teamspaceId;

  if (
    parentRecord &&
    teamspaceId !== null &&
    teamspaceId !== parentRecord.teamspaceId
  ) {
    return c.json(
      { error: "A nested page must use its parent teamspace." },
      409,
    );
  }

  if (
    resolvedTeamspaceId &&
    !hasAccess(
      await getEffectiveTeamspaceAccessInWorkspace(
        resolvedTeamspaceId,
        workspaceId,
        user.id,
      ),
      "edit",
    )
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const pageId = crypto.randomUUID();
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
  const placementId = parentItemId ? crypto.randomUUID() : null;
  const placement = parentItemId
    ? {
        id: placementId as string,
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
  const { record, navigationEvent } = await db.transaction(async (tx) => {
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
        hasContent: hasPageBodyContent(content),
        metadata,
        teamspaceId: resolvedTeamspaceId,
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

    await tx.insert(pageCollaborationDocument).values({
      pageId,
      state: Buffer.from(encodePageContentAsYjs(content)),
      updatedAt: new Date(),
    });

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

    const navigationEvent = await enqueueNavigationInvalidation(tx, workspaceId);
    return { record: created, navigationEvent };
  });

  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

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

pageHierarchyRoutes.post("/:id/move-teamspace", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await readJsonBody(c.req);
  const destinationId =
    body && typeof body === "object"
      ? (body as { teamspaceId?: unknown }).teamspaceId
      : undefined;
  if (destinationId !== null && typeof destinationId !== "string") {
    return c.json({ error: "teamspaceId must be a string or null" }, 400);
  }

  const record = await getPage(c.req.param("id"));
  if (!record) return c.json({ error: "Page not found" }, 404);
  if (
    !(await canAccessPageInWorkspace(
      record.id,
      record.workspaceId,
      user.id,
      "full",
    ))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (
    destinationId &&
    !hasAccess(
      await getEffectiveTeamspaceAccessInWorkspace(
        destinationId,
        record.workspaceId,
        user.id,
      ),
      "edit",
    )
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (!destinationId && !(await getMembership(record.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const graph = await loadWorkspacePageGraph(record.workspaceId);
  const pageIds = graph.getPrimaryNestedPageIds(record.id);
  const now = new Date();
  const navigationEvent = await db.transaction(async (tx) => {
    await tx
      .update(page)
      .set({ teamspaceId: destinationId, updatedAt: now })
      .where(inArray(page.id, pageIds));
    await tx
      .update(database)
      .set({ teamspaceId: destinationId, updatedAt: now })
      .where(inArray(database.pageId, pageIds));
    await tx
      .update(pageItemPlacement)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(pageItemPlacement.workspaceId, record.workspaceId),
          eq(pageItemPlacement.itemKind, "page"),
          eq(pageItemPlacement.itemId, record.id),
          eq(pageItemPlacement.placementKind, "primary"),
          isNull(pageItemPlacement.deletedAt),
        ),
      );
    return enqueueNavigationInvalidation(tx, record.workspaceId, { committedAt: now });
  });
  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

  return c.json({ movedPageIds: pageIds, teamspaceId: destinationId });
});

pageHierarchyRoutes.post("/:id/convert-to-teamspace", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const record = await getPage(c.req.param("id"));
  if (!record) return c.json({ error: "Page not found" }, 404);
  if (record.teamspaceId) {
    return c.json({ error: "This page is already in a teamspace." }, 409);
  }
  if (
    !(await canAccessPageInWorkspace(
      record.id,
      record.workspaceId,
      user.id,
      "full",
    ))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const body = await readJsonBody(c.req, {});
  const accessMode =
    body && typeof body === "object" &&
    ["open", "closed", "private"].includes(
      String((body as { accessMode?: unknown }).accessMode),
    )
      ? (body as { accessMode: "open" | "closed" | "private" }).accessMode
      : "closed";
  const requestedName =
    body && typeof body === "object" &&
    typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";
  const service = new TeamspaceManagementService(
    undefined,
    c.get("editionExtension") ?? undefined,
    c.env,
  );
  try {
    const created = await service.create({
      accessMode,
      name: requestedName || record.name.trim() || "Untitled teamspace",
      userId: user.id,
      workspaceId: record.workspaceId,
    });
    const graph = await loadWorkspacePageGraph(record.workspaceId);
    const pageIds = graph.getPrimaryNestedPageIds(record.id);
    const navigationEvent = await db.transaction(async (tx) => {
      await tx
        .update(page)
        .set({ teamspaceId: created.id, updatedAt: new Date() })
        .where(inArray(page.id, pageIds));
      await tx
        .update(database)
        .set({ teamspaceId: created.id, updatedAt: new Date() })
        .where(inArray(database.pageId, pageIds));
      await tx
        .update(pageItemPlacement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(pageItemPlacement.workspaceId, record.workspaceId),
            eq(pageItemPlacement.itemKind, "page"),
            eq(pageItemPlacement.itemId, record.id),
            eq(pageItemPlacement.placementKind, "primary"),
            isNull(pageItemPlacement.deletedAt),
          ),
        );
      return enqueueNavigationInvalidation(tx, record.workspaceId);
    });
    await publishCommittedNavigationInvalidation(navigationEvent, c.env);
    return c.json({ movedPageIds: pageIds, teamspace: created }, 201);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return c.json(
        { error: error.message },
        (error as { status: 400 | 403 | 404 | 409 }).status,
      );
    }
    throw error;
  }
});

pageHierarchyRoutes.post("/:id/embed-item", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hostId = c.req.param("id");
  const body = await readJsonBody(c.req);

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

  if (
    !(await canAccessPageInWorkspace(
      host.id,
      host.workspaceId,
      user.id,
      "edit",
    ))
  ) {
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

    if (
      !(await canAccessPageInWorkspace(
        child.id,
        child.workspaceId,
        user.id,
        "view",
      ))
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const graph = await loadWorkspacePageGraph(host.workspaceId);

    if (graph.getPrimaryNestedPageIds(child.id).includes(host.id)) {
      return c.json({ error: "Embedding would create a cycle" }, 400);
    }

    const [primaryPlacement, sourceDatabaseRow] = await Promise.all([
      db
        .select({ parentId: pageItemPlacement.parentId })
        .from(pageItemPlacement)
        .where(
          and(
            eq(pageItemPlacement.workspaceId, host.workspaceId),
            eq(pageItemPlacement.itemKind, "page"),
            eq(pageItemPlacement.itemId, child.id),
            eq(pageItemPlacement.placementKind, "primary"),
            isNull(pageItemPlacement.deletedAt),
          ),
        )
        .limit(1),
      db
        .select({ id: databaseRow.id })
        .from(databaseRow)
        .where(
          and(eq(databaseRow.pageId, child.id), isNull(databaseRow.deletedAt)),
        )
        .limit(1),
    ]);
    const action =
      primaryPlacement[0]?.parentId === host.id
        ? "setParent"
        : primaryPlacement.length === 0 && sourceDatabaseRow.length === 0
          ? "setParent"
          : "addLink";

    if (primaryPlacement[0]?.parentId !== host.id) {
      const navigationEvent = await db.transaction(async (tx) => {
        await upsertPageItemPlacement(tx, {
          workspaceId: host.workspaceId,
          parentKind: "page",
          parentId: host.id,
          itemKind: "page",
          itemId: child.id,
          placementKind: action === "setParent" ? "primary" : "linked",
        });
        return enqueueNavigationInvalidation(tx, host.workspaceId);
      });
      await publishCommittedNavigationInvalidation(navigationEvent, c.env);
    }

    return c.json({
      action,
      host,
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

  if (
    !(await canAccessDatabaseInWorkspace(
      databaseRecord.id,
      databaseRecord.workspaceId,
      user.id,
      "view",
    ))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (databaseRecord.pageId === host.id) {
    return c.json({ action: "setParent", host });
  }

  const navigationEvent = await db.transaction(async (tx) => {
    await upsertPageItemPlacement(tx, {
      workspaceId: host.workspaceId,
      parentKind: "page",
      parentId: host.id,
      itemKind: "database",
      itemId: databaseRecord.id,
      placementKind: "linked",
    });
    return enqueueNavigationInvalidation(tx, host.workspaceId);
  });
  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

  return c.json({ action: "addLink", host });
});

pageHierarchyRoutes.delete("/:id/embed-item", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hostId = c.req.param("id");
  const body = await readJsonBody(c.req);

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

  if (
    !(await canAccessPageInWorkspace(
      host.id,
      host.workspaceId,
      user.id,
      "edit",
    ))
  ) {
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
  const [placement] = await db
    .select({ placementKind: pageItemPlacement.placementKind })
    .from(pageItemPlacement)
    .where(
      and(
        eq(pageItemPlacement.workspaceId, host.workspaceId),
        eq(pageItemPlacement.parentKind, "page"),
        eq(pageItemPlacement.parentId, host.id),
        eq(pageItemPlacement.itemKind, kind),
        eq(pageItemPlacement.itemId, itemId),
        isNull(pageItemPlacement.deletedAt),
      ),
    )
    .limit(1);

  const navigationEvent = await db.transaction(async (tx) => {
    await softDeletePageItemPlacement(tx, {
      workspaceId: host.workspaceId,
      parentKind: "page",
      parentId: host.id,
      item: ref,
    });
    return enqueueNavigationInvalidation(tx, host.workspaceId);
  });
  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

  return c.json({
    action:
      placement?.placementKind === "primary" ? "clearParent" : "removeLink",
  });
});

