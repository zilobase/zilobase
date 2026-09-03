import { Hono } from "hono";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { getDatabasePayload } from "./core/payload";
import { updateDatabaseFavoriteService } from "./core/favorite-service";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { deleteDatabaseAccessRuleService, deletePublicDatabaseAccessService, listDatabaseAccessRulesService, upsertDatabaseAccessRuleService } from "./sharing/service";
import { createDatabaseService, deleteDatabaseService, restoreDatabaseService } from "./core/service";
import { requireDatabaseRouteUser as requireUser, serviceMutationErrorResponse } from "./route-support";

export const databaseCoreRoutes = new Hono<AppBindings>();
export const databaseCreateRoutes = new Hono<AppBindings>();

databaseCreateRoutes.post("/", async (c) => {
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

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

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

  try {
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
    const payload = await getDatabasePayload(created.databaseId, user.id);

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
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});


databaseCoreRoutes.get("/:id/access", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json(
      await listDatabaseAccessRulesService({
        databaseId: c.req.param("id"),
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseCoreRoutes.put("/:id/access", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await readJsonBody(c.req);

  try {
    return c.json(
      await upsertDatabaseAccessRuleService({
        body,
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseCoreRoutes.delete("/:id/access/public", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json(
      await deletePublicDatabaseAccessService({
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseCoreRoutes.delete("/:id/access/:ruleId", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json(
      await deleteDatabaseAccessRuleService({
        databaseId: c.req.param("id"),
        env: c.env,
        ruleId: c.req.param("ruleId"),
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseCoreRoutes.put("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    return c.json(
      await updateDatabaseFavoriteService({
        databaseId: c.req.param("id"),
        favorite: true,
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseCoreRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    return c.json(
      await deleteDatabaseService({
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseCoreRoutes.post("/:id/restore", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    return c.json(
      await restoreDatabaseService({
        databaseId: c.req.param("id"),
        env: c.env,
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseCoreRoutes.delete("/:id/favorite", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    return c.json(
      await updateDatabaseFavoriteService({
        databaseId: c.req.param("id"),
        favorite: false,
        userId: user.id,
      }),
    );
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});
