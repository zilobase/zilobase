import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getAuthenticatedUser as requireUser } from "../../shared/http/auth";
import { canAccessDatabaseInWorkspace, canAccessPageInWorkspace, getEffectivePageAccessInWorkspace, getEffectivePageAccessForUsers, getMembership, hasAccess, normalizeAccessLevel } from "../access";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import { db } from "../../infrastructure/database";
import { favorite, itemVisit, member, team, user as userTable, page, pageAccess, workspaceGuest } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { activeMembershipCondition } from "../memberships";
import { getPageTeamspaceSecurityPolicy } from "../teamspaces";
import { enqueueNavigationInvalidation, publishCommittedNavigationInvalidation } from "../workspaces/navigation-realtime/outbox";
import { enforceActiveWorkspace, getPage } from "./page-route-support";

export const pageSharingRoutes = new Hono<AppBindings>();
export const pageVisitRoutes = new Hono<AppBindings>();

pageVisitRoutes.post("/item-visits", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

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

  const canView =
    itemKind === "page"
      ? await canAccessPageInWorkspace(itemId, workspaceId, user.id, "view")
      : await canAccessDatabaseInWorkspace(
          itemId,
          workspaceId,
          user.id,
          "view",
        );

  if (!canView) {
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


pageSharingRoutes.put("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (
    !(await canAccessPageInWorkspace(
      record.id,
      record.workspaceId,
      user.id,
      "view",
    ))
  ) {
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

pageSharingRoutes.delete("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getPage(c.req.param("id"));

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (
    !(await canAccessPageInWorkspace(
      record.id,
      record.workspaceId,
      user.id,
      "view",
    ))
  ) {
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

pageSharingRoutes.get("/:id/access", async (c) => {
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

pageSharingRoutes.get("/:id/access-targets", async (c) => {
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

  const [members, guests] = await Promise.all([
    db
      .select({
        email: userTable.email,
        id: userTable.id,
        memberId: member.id,
        name: userTable.name,
        role: member.role,
        accessExpiresAt: member.accessExpiresAt,
      })
      .from(member)
      .innerJoin(userTable, eq(member.userId, userTable.id))
      .where(
        and(
          eq(member.organizationId, record.workspaceId),
          activeMembershipCondition(),
        ),
      )
      .orderBy(asc(userTable.name), asc(userTable.email)),
    db
      .select({
        email: userTable.email,
        id: userTable.id,
        guestId: workspaceGuest.id,
        name: userTable.name,
      })
      .from(workspaceGuest)
      .innerJoin(userTable, eq(workspaceGuest.userId, userTable.id))
      .where(eq(workspaceGuest.workspaceId, record.workspaceId))
      .orderBy(asc(userTable.name), asc(userTable.email)),
  ]);

  const accessByUserId = await getEffectivePageAccessForUsers(
    record.id,
    record.workspaceId,
    [...members, ...guests].map((targetUser) => targetUser.id),
  );
  const accessibleMembers = members.filter((targetMember) =>
    hasAccess(accessByUserId.get(targetMember.id) ?? "none", "view"),
  );

  const accessibleGuests = guests.filter((guest) =>
    hasAccess(accessByUserId.get(guest.id) ?? "none", "view"),
  );

  return c.json({ guests: accessibleGuests, members: accessibleMembers });
});

pageSharingRoutes.put("/:id/access", async (c) => {
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

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { targetType, targetId, accessLevel } = body as {
    accessLevel?: unknown;
    targetId?: unknown;
    targetType?: unknown;
  };
  const normalizedAccessLevel = normalizeAccessLevel(accessLevel);

  if (
    targetType !== "public" &&
    targetType !== "user" &&
    targetType !== "team"
  ) {
    return c.json({ error: "targetType must be public, user, or team" }, 400);
  }

  if (typeof targetId !== "string" || targetId.length === 0) {
    return c.json({ error: "targetId is required" }, 400);
  }

  if (!normalizedAccessLevel) {
    return c.json(
      { error: "accessLevel must be view, comment, edit, or full" },
      400,
    );
  }

  if (targetType === "public") {
    const teamspacePolicy = await getPageTeamspaceSecurityPolicy(record.id);
    if (teamspacePolicy && !teamspacePolicy.publicSharingEnabled) {
      return c.json(
        { error: "Public sharing is disabled for this teamspace." },
        403,
      );
    }
    if (targetId !== "*") {
      return c.json({ error: "public targetId must be *" }, 400);
    }

    if (normalizedAccessLevel !== "view") {
      return c.json({ error: "public access must be view" }, 400);
    }
  }

  let target: { id: string } | undefined;

  if (targetType === "public") {
    target = { id: "*" };
  } else if (targetType === "team") {
    [target] = await db
      .select({ id: team.id })
      .from(team)
      .where(
        and(
          eq(team.organizationId, record.workspaceId),
          eq(team.id, targetId),
        ),
      )
      .limit(1);
  } else {
    const [memberTargets, guestTargets] = await Promise.all([
      db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, record.workspaceId),
            eq(member.userId, targetId),
            activeMembershipCondition(),
          ),
        )
        .limit(1),
      db
        .select({ id: workspaceGuest.id })
        .from(workspaceGuest)
        .where(
          and(
            eq(workspaceGuest.workspaceId, record.workspaceId),
            eq(workspaceGuest.userId, targetId),
          ),
        )
        .limit(1),
    ]);
    target = memberTargets[0] ?? guestTargets[0];
  }

  if (!target) {
    return c.json({ error: "Target not found" }, 404);
  }

  const { navigationEvent, rule } = await db.transaction(async (tx) => {
    const [rule] = await tx
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
        target: [pageAccess.pageId, pageAccess.targetType, pageAccess.targetId],
        set: {
          accessLevel: normalizedAccessLevel,
          updatedAt: new Date(),
        },
      })
      .returning();
    return {
      navigationEvent: await enqueueNavigationInvalidation(tx, record.workspaceId),
      rule,
    };
  });
  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

  return c.json({ access: rule });
});

pageSharingRoutes.delete("/:id/access/public", async (c) => {
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

  const { navigationEvent, rule } = await db.transaction(async (tx) => {
    const [rule] = await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.pageId, record.id),
          eq(pageAccess.targetType, "public"),
          eq(pageAccess.targetId, "*"),
        ),
      )
      .returning();
    return {
      navigationEvent: await enqueueNavigationInvalidation(tx, record.workspaceId),
      rule,
    };
  });
  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

  return c.json({ access: rule ?? null });
});

pageSharingRoutes.delete("/:id/access/:ruleId", async (c) => {
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

  const { navigationEvent, rule } = await db.transaction(async (tx) => {
    const [rule] = await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.id, c.req.param("ruleId")),
          eq(pageAccess.pageId, record.id),
        ),
      )
      .returning();
    return {
      navigationEvent: await enqueueNavigationInvalidation(tx, record.workspaceId),
      rule,
    };
  });

  if (!rule) {
    return c.json({ error: "Access rule not found" }, 404);
  }

  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

  return c.json({ access: rule });
});
