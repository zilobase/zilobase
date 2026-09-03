import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { getAuthenticatedUser as requireUser } from "../../shared/http/auth";
import { canAccessDatabaseInWorkspace, canAccessPageInWorkspace, getEffectivePageAccessInWorkspace, getWorkspaceRealtimeAccessExpiration, hasAccess } from "../access";
import { db } from "../../infrastructure/database";
import { database, dataSource, databaseProperty, databaseRow, page, pageProperty, pagePropertyValue } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { createCollaborationTicket, documentNameForPage, getOrCreateCollaborationDocumentState, replacePageContent } from "../collaboration/service";
import { getCollaborationWebSocketUrl } from "../../infrastructure/runtime/runtime-adapter";
import { enqueueNavigationInvalidation, publishCommittedNavigationInvalidation } from "../workspaces/navigation-realtime/outbox";
import { commitDatabaseMutationBatch, mutationResponse } from "../databases/core";
import { lockDatabaseAutomationFactRows } from "../databases/automations/event-capture";
import { enforceActiveWorkspace, getPage, getPagePropertyPayload } from "./page-route-support";

export const pageContentRoutes = new Hono<AppBindings>();

pageContentRoutes.get("/:id/properties", async (c) => {
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

  const propertiesOrgMismatch = await enforceActiveWorkspace(
    c,
    record.workspaceId,
    user.id,
  );

  if (propertiesOrgMismatch) {
    return propertiesOrgMismatch;
  }

  return c.json(
    await getPagePropertyPayload(record.id, record.workspaceId, user.id),
  );
});

pageContentRoutes.put("/:id/properties/:propertyId/value", async (c) => {
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
      "edit",
    ))
  ) {
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

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const propertyId = c.req.param("propertyId");
  const { value = null } = body as { value?: unknown };
  const candidateMemberships = await db
    .select({
      databaseId: dataSource.parentDatabaseId,
      dataSourceId: dataSource.id,
      property: pageProperty,
      rowId: databaseRow.id,
    })
    .from(databaseRow)
    .innerJoin(
      databaseProperty,
      and(
        eq(databaseProperty.dataSourceId, databaseRow.dataSourceId),
        eq(databaseProperty.propertyId, propertyId),
      ),
    )
    .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
    .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
    .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
    .where(
      and(
        eq(databaseRow.pageId, record.id),
        eq(pageProperty.workspaceId, record.workspaceId),
        isNull(databaseRow.deletedAt),
        isNull(database.deletedAt),
        isNull(pageProperty.deletedAt),
      ),
    );
  const accessibleDatabaseIds = new Set(
    (
      await Promise.all(
        [...new Set(candidateMemberships.map(({ databaseId }) => databaseId))]
          .map(async (databaseId) =>
            await canAccessDatabaseInWorkspace(
                databaseId,
                record.workspaceId,
                user.id,
                "view",
              )
              ? databaseId
              : null
          ),
      )
    ).filter((databaseId): databaseId is string => Boolean(databaseId)),
  );
  const memberships = candidateMemberships.filter(({ databaseId }) =>
    accessibleDatabaseIds.has(databaseId)
  );

  if (memberships.length === 0) {
    return c.json({ error: "Property not found" }, 404);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { commits } = await commitDatabaseMutationBatch(
    { actorId: user.id, env: c.env },
    async (tx) => {
      await lockDatabaseAutomationFactRows(
        tx,
        memberships.map(({ dataSourceId, rowId }) => ({ dataSourceId, rowId })),
      );
      const [previousValue] = await tx
        .select({ value: pagePropertyValue.value })
        .from(pagePropertyValue)
        .where(
          and(
            eq(pagePropertyValue.pageId, record.id),
            eq(pagePropertyValue.propertyId, propertyId),
          ),
        )
        .limit(1);
      const [savedValue] = await tx
        .insert(pagePropertyValue)
        .values({
          id: crypto.randomUUID(),
          pageId: record.id,
          propertyId,
          value,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
          set: { value, updatedAt: now },
        })
        .returning();

      if (!savedValue) {
        throw new Error("Failed to save page property value");
      }

      await tx
        .update(databaseRow)
        .set({ lastEditedById: user.id, updatedAt: now })
        .where(inArray(databaseRow.id, memberships.map(({ rowId }) => rowId)));
      await tx
        .update(page)
        .set({ updatedAt: now })
        .where(eq(page.id, record.id));

      return {
        automationFacts: memberships.map(({ dataSourceId, rowId }) => ({
          actorId: user.id,
          changedValues: [
            {
              after: value,
              before: previousValue?.value ?? null,
              propertyId,
            },
          ],
          dataSourceId,
          origin:
            c.get("authMethod") === "apiKey"
              ? "api" as const
              : "user" as const,
          pageId: record.id,
          rowId,
        })),
        mutations: memberships.map(({ databaseId, rowId }) => ({
          changed: ["rows" as const, "values" as const],
          databaseId,
          delta: {
            rows: [{ id: rowId, lastEditedById: user.id, updatedAt: nowIso }],
            values: [
              {
                createdAt: savedValue.createdAt.toISOString(),
                id: savedValue.id,
                pageId: savedValue.pageId,
                propertyId: savedValue.propertyId,
                updatedAt: savedValue.updatedAt.toISOString(),
                value: savedValue.value,
              },
            ],
          },
        })),
        result: undefined,
      };
    },
  );

  return c.json({ mutations: commits.map(mutationResponse) });
});

pageContentRoutes.post("/:id/collaboration-ticket", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  const accessLevel = await getEffectivePageAccessInWorkspace(
    existing.id,
    existing.workspaceId,
    user.id,
  );

  if (!hasAccess(accessLevel, "view")) {
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

  const [ticket, initialState] = await Promise.all([
    createCollaborationTicket(
      {
        pageId: existing.id,
        scope: hasAccess(accessLevel, "edit")
          ? "read-write"
          : hasAccess(accessLevel, "comment")
            ? "comment"
            : "readonly",
        userId: user.id,
        workspaceId: existing.workspaceId,
      },
      c.env,
      {
        maxExpiresAt: await getWorkspaceRealtimeAccessExpiration(
          existing.workspaceId,
          user.id,
        ),
      },
    ),
    getOrCreateCollaborationDocumentState(existing.id),
  ]);
  const documentName = documentNameForPage(existing.id);
  const websocketUrl = new URL(getCollaborationWebSocketUrl(c.req.raw, c.env));
  websocketUrl.searchParams.set("document", documentName);

  return c.json({
    documentName,
    initialState: Buffer.from(initialState).toString("base64"),
    websocketUrl: websocketUrl.toString(),
    ...ticket,
  });
});

pageContentRoutes.patch("/:id/content", async (c) => {
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
      "edit",
    ))
  ) {
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

  const body = await readJsonBody(c.req);

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

pageContentRoutes.patch("/:id", async (c) => {
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
      "edit",
    ))
  ) {
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

  const body = await readJsonBody(c.req);

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
    values.metadata = patch.metadata;
  }

  const updatesDatabaseRow =
    patch.name !== undefined || patch.metadata !== undefined;
  const changesNavigation =
    patch.name !== undefined || patch.metadata !== undefined || patch.type !== undefined;
  const mutationResult = updatesDatabaseRow
    ? (
        await commitDatabaseMutationBatch(
          { actorId: user.id, env: c.env },
          async (tx) => {
            const rowMemberships = await tx
              .select({
                dataSourceId: databaseRow.dataSourceId,
                rowId: databaseRow.id,
              })
              .from(databaseRow)
              .where(
                and(
                  eq(databaseRow.pageId, existing.id),
                  isNull(databaseRow.deletedAt),
                ),
              );
            await lockDatabaseAutomationFactRows(tx, rowMemberships);
            const [updatedPage] = await tx
              .update(page)
              .set(values)
              .where(eq(page.id, existing.id))
              .returning();

            if (!updatedPage) {
              throw new Error("Page disappeared during update");
            }

            const rows = await tx
              .select({
                databaseId: dataSource.parentDatabaseId,
                dataSourceId: dataSource.id,
                row: databaseRow,
              })
              .from(databaseRow)
              .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
              .where(
                and(
                  eq(databaseRow.pageId, existing.id),
                  isNull(databaseRow.deletedAt),
                ),
              );

            return {
              automationFacts:
                patch.name === undefined
                  ? []
                  : rows.map(({ dataSourceId, row }) => ({
                      actorId: user.id,
                      changedValues: [
                        {
                          after: updatedPage.name,
                          before: existing.name,
                          propertyId: "name",
                        },
                      ],
                      dataSourceId,
                      origin:
                        c.get("authMethod") === "apiKey"
                          ? "api" as const
                          : "user" as const,
                      pageId: existing.id,
                      rowId: row.id,
                    })),
              mutations: rows.map(({ databaseId, row }) => ({
                changed: ["rows" as const],
                databaseId,
                delta: {
                  rows: [
                    {
                      ...row,
                      page: {
                        createdAt: updatedPage.createdAt,
                        id: updatedPage.id,
                        metadata: updatedPage.metadata,
                        name: updatedPage.name,
                        updatedAt: updatedPage.updatedAt,
                      },
                    },
                  ],
                },
              })),
              result: {
                navigationEvent: changesNavigation
                  ? await enqueueNavigationInvalidation(tx, existing.workspaceId)
                  : null,
                page: updatedPage,
              },
            };
          },
        )
      ).result
    : await db.transaction(async (tx) => {
        const [updatedPage] = await tx
          .update(page)
          .set(values)
          .where(eq(page.id, existing.id))
          .returning();
        return {
          navigationEvent: changesNavigation
            ? await enqueueNavigationInvalidation(tx, existing.workspaceId)
            : null,
          page: updatedPage,
        };
      });
  const record = mutationResult.page;

  if (!record) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (mutationResult.navigationEvent) {
    await publishCommittedNavigationInvalidation(
      mutationResult.navigationEvent,
      c.env,
    );
  }

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

