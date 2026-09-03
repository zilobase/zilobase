import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { getAuthenticatedUser as requireUser } from "../../shared/http/auth";
import { canAccessPageInWorkspace, getMembership } from "../access";
import { db } from "../../infrastructure/database";
import { database, dataSource, databaseRow, page } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { softDeletePageTree } from "./mutations/soft-delete-nav-items";
import { enqueueNavigationInvalidation, publishCommittedNavigationInvalidation } from "../workspaces/navigation-realtime/outbox";
import { enforceActiveWorkspace, getPage, getPageIncludingDeleted } from "./page-route-support";

export const pageLifecycleRoutes = new Hono<AppBindings>();

pageLifecycleRoutes.post("/:id/restore", async (c) => {
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

  if (!existing.deletedAt) {
    return c.json({
      page: existing,
      restoredDatabaseIds: [],
      restoredPageIds: [],
    });
  }

  const deletedAt = existing.deletedAt;
  const { navigationEvent, ...restored } = await db.transaction(async (tx) => {
    const now = new Date();
    const restoredPages = await tx
      .update(page)
      .set({
        deletedAt: null,
        deletedById: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(page.workspaceId, existing.workspaceId),
          eq(page.deletedAt, deletedAt),
          existing.deletedById
            ? eq(page.deletedById, existing.deletedById)
            : undefined,
        ),
      )
      .returning();
    const restoredDatabases = await tx
      .update(database)
      .set({
        deletedAt: null,
        deletedById: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(database.workspaceId, existing.workspaceId),
          eq(database.deletedAt, deletedAt),
          existing.deletedById
            ? eq(database.deletedById, existing.deletedById)
            : undefined,
        ),
      )
      .returning({ id: database.id });
    const restoredDatabaseIds = restoredDatabases.map((record) => record.id);

    if (restoredDatabaseIds.length > 0) {
      await tx
        .update(databaseRow)
        .set({
          deletedAt: null,
          deletedById: null,
          updatedAt: now,
        })
        .where(
          and(
            inArray(
              databaseRow.dataSourceId,
              tx
                .select({ id: dataSource.id })
                .from(dataSource)
                .where(
                  inArray(dataSource.parentDatabaseId, restoredDatabaseIds),
                ),
            ),
            eq(databaseRow.deletedAt, deletedAt),
            existing.deletedById
              ? eq(databaseRow.deletedById, existing.deletedById)
              : undefined,
          ),
        );
    }

    return {
      navigationEvent: await enqueueNavigationInvalidation(
        tx,
        existing.workspaceId,
        { committedAt: now },
      ),
      page:
        restoredPages.find((record) => record.id === existing.id) ?? existing,
      restoredDatabaseIds,
      restoredPageIds: restoredPages.map((record) => record.id),
    };
  });
  await publishCommittedNavigationInvalidation(navigationEvent, c.env);

  return c.json(restored);
});

pageLifecycleRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (
    !(await canAccessPageInWorkspace(
      existing.id,
      existing.workspaceId,
      user.id,
      "full",
    ))
  ) {
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

  const { deletedDatabaseIds, deletedPageIds } = await softDeletePageTree({
    env: c.env,
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
