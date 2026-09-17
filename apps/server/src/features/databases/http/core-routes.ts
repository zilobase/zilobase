import { getDatabaseRecord } from  "../access/database-access";
import { pinnedResourceMiddleware } from  "../../auth/pinned-resource-middleware";
import { readAuthenticatedJson } from   "../../../shared/http/auth";
import { Hono } from "hono";
import { rejectMismatchedPinnedWorkspace } from  "../../auth/oauth-access";
import type { AppBindings } from   "../../../shared/types";
import { readJsonBody } from   "../../../shared/http/request";
import { getDatabaseExportPayload } from  "../core/payload";
import { updateDatabaseFavoriteService } from  "../core/favorite-service";
import { deleteDatabaseAccessRuleService, deletePublicDatabaseAccessService, listDatabaseAccessRulesService, upsertDatabaseAccessRuleService } from  "../sharing/service";
import { createDatabaseService, deleteDatabaseService, restoreDatabaseService } from  "../core/service";
import { requireDatabaseRouteUser as requireUser } from  "./support";

export const databaseCoreRoutes = new Hono<AppBindings>();
const resourceWorkspace = pinnedResourceMiddleware((id) => getDatabaseRecord(id, { includeDeleted: true }));

export const databaseCreateRoutes = new Hono<AppBindings>();

databaseCreateRoutes.post("/", async (c) => {
  const request = await readAuthenticatedJson(c);
  if (!request.ok) return request.response;
  const { user, body } = request;

  const {
    workspaceId,
    pageId,
    name = "New database",
    standalone = false,
    teamspaceId,
  } = body as {
    workspaceId?: unknown;
    pageId?: unknown;
    name?: unknown;
    standalone?: unknown;
    teamspaceId?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedPinnedWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (
    standalone !== true &&
    (typeof pageId !== "string" || pageId.length === 0)
  ) {
    return c.json({ error: "pageId is required" }, 400);
  }

  if (typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  if (
    teamspaceId !== undefined &&
    teamspaceId !== null &&
    typeof teamspaceId !== "string"
  ) {
    return c.json({ error: "teamspaceId must be a string or null" }, 400);
  }

    const created = await createDatabaseService({
      env: c.env,
      name,
      pageId: typeof pageId === "string" ? pageId : undefined,
      standalone: standalone === true,
      teamspaceId:
        typeof teamspaceId === "string" || teamspaceId === null
          ? teamspaceId
          : undefined,
      userId: user.id,
      workspaceId,
    });
    const payload = await getDatabaseExportPayload(created.databaseId, user.id);

    if (!payload) {
      return c.json({ error: "Database not found" }, 404);
    }

    return c.json(
      {
        ...payload,
        database: {
          ...payload.database,
          accessLevel: "full" as const,
        },
        navDelta: {
          upsertDatabases: [
            {
              ...payload.database,
              accessLevel: "full" as const,
              views: payload.views,
            },
          ],
          upsertPlacements: created.parentPlacement
            ? [created.parentPlacement]
            : [],
        },
      },
      201,
    );
});


databaseCoreRoutes.get("/:id/access", resourceWorkspace, async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

    return c.json(
      await listDatabaseAccessRulesService({
        databaseId: c.req.param("id"),
        userId: user.id,
      }),
    );
});

databaseCoreRoutes.put("/:id/access", resourceWorkspace, async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await readJsonBody(c.req);

    return c.json(
      await upsertDatabaseAccessRuleService({
        body,
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
});

databaseCoreRoutes.delete("/:id/access/public", resourceWorkspace, async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

    return c.json(
      await deletePublicDatabaseAccessService({
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
});

databaseCoreRoutes.delete("/:id/access/:ruleId", resourceWorkspace, async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

    return c.json(
      await deleteDatabaseAccessRuleService({
        databaseId: c.req.param("id"),
        env: c.env,
        ruleId: c.req.param("ruleId"),
        userId: user.id,
      }),
    );
});

databaseCoreRoutes.put("/:id/favorite", resourceWorkspace, async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

    return c.json(
      await updateDatabaseFavoriteService({
        databaseId: c.req.param("id"),
        favorite: true,
        userId: user.id,
      }),
    );
});

databaseCoreRoutes.delete("/:id", resourceWorkspace, async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

    return c.json(
      await deleteDatabaseService({
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
});

databaseCoreRoutes.post("/:id/restore", resourceWorkspace, async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

    return c.json(
      await restoreDatabaseService({
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
});

databaseCoreRoutes.delete("/:id/favorite", resourceWorkspace, async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

    return c.json(
      await updateDatabaseFavoriteService({
        databaseId: c.req.param("id"),
        favorite: false,
        userId: user.id,
      }),
    );
});
