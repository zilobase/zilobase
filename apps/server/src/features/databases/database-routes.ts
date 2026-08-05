import { Hono } from "hono";
import type { Context } from "hono";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import type { AppBindings } from "../../types";
import { mutationResponse } from "../../services/database-commit";
import { getDatabasePayload } from "../../services/database-payload";
import { hasDuplicateValues } from "../../services/database-position-service";
import { updateDatabaseFavoriteService } from "../../services/database-favorite-service";
import {
  createDatabasePropertyService,
  updateDatabasePropertyService,
} from "../../services/database-property-service";
import {
  deleteDatabasePropertyService,
  reorderDatabasePropertiesService,
} from "../../services/database-property-structure-service";
import { duplicateDatabasePropertyService } from "../../services/database-property-duplication-service";
import { createDatabaseRowService } from "../../services/database-row-service";
import { setDatabaseCellValueService } from "../../services/database-cell-service";
import {
  moveDatabaseRowService,
  reorderDatabaseRowsService,
} from "../../services/database-row-position-service";
import { ServiceMutationError } from "../../services/mutation-error";
import {
  deleteDatabaseAccessRuleService,
  deletePublicDatabaseAccessService,
  listDatabaseAccessRulesService,
  upsertDatabaseAccessRuleService,
} from "../../services/database-sharing-service";
import {
  createDatabaseService,
  deleteDatabaseService,
  restoreDatabaseService,
  updateDatabaseService,
} from "../../services/database-service";
import {
  createDatabaseViewService,
  deleteDatabaseViewService,
  updateDatabaseViewService,
} from "../../services/database-view-service";
import { normalizeDatabasePropertyType } from "../../services/database-property-types";
import { databaseReadRoutes } from "./database-read-routes";

export const databaseRoutes = new Hono<AppBindings>();

const requireUser = (c: Context<AppBindings>) => c.get("user") ?? null;

const serviceMutationErrorResponse = (
  c: Context<AppBindings>,
  error: ServiceMutationError,
) =>
  c.json(
    { error: error.message },
    error.status === 403 ? 403 : error.status === 404 ? 404 : 400,
  );

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
    workspaceId,
    pageId,
    name = "New database",
    standalone = false,
  } = body as {
    workspaceId?: unknown;
    pageId?: unknown;
    name?: unknown;
    standalone?: unknown;
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

  try {
    const created = await createDatabaseService({
      name,
      pageId: typeof pageId === "string" ? pageId : undefined,
      standalone: standalone === true,
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

databaseRoutes.route("/", databaseReadRoutes);

databaseRoutes.get("/:id/access", async (c) => {
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

databaseRoutes.put("/:id/access", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);

  try {
    return c.json(
      await upsertDatabaseAccessRuleService({
        body,
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

databaseRoutes.delete("/:id/access/public", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json(
      await deletePublicDatabaseAccessService({
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

databaseRoutes.delete("/:id/access/:ruleId", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json(
      await deleteDatabaseAccessRuleService({
        databaseId: c.req.param("id"),
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

databaseRoutes.put("/:id/favorite", async (c) => {
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

databaseRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    return c.json(
      await deleteDatabaseService({
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

databaseRoutes.post("/:id/restore", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    return c.json(
      await restoreDatabaseService({
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

databaseRoutes.delete("/:id/favorite", async (c) => {
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

databaseRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const patch = body as { name?: unknown; config?: unknown };
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      return c.json({ error: "name must be a string" }, 400);
    }
  }

  try {
    const result = await updateDatabaseService({
      databaseId: c.req.param("id"),
      env: c.env,
      userId: user.id,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.config !== undefined ? { config: patch.config } : {}),
    });

    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.patch("/:id/views/:viewId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const patch = body as { name?: unknown; config?: unknown; type?: unknown };

  if (patch.name !== undefined && typeof patch.name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  if (patch.type !== undefined && typeof patch.type !== "string") {
    return c.json({ error: "type must be a string" }, 400);
  }

  try {
    const result = await updateDatabaseViewService({
      databaseId: c.req.param("id"),
      env: c.env,
      userId: user.id,
      viewId: c.req.param("viewId"),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.config !== undefined ? { config: patch.config } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
    });

    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.post("/:id/views", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const {
    config = null,
    name = "Table",
    type = "table",
  } = body as {
    config?: unknown;
    name?: unknown;
    type?: unknown;
  };

  if (typeof name !== "string" || typeof type !== "string") {
    return c.json({ error: "name and type must be strings" }, 400);
  }

  try {
    const result = await createDatabaseViewService({
      config,
      databaseId: c.req.param("id"),
      env: c.env,
      name,
      type,
      userId: user.id,
    });

    return c.json(mutationResponse(result.commit), 201);
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.delete("/:id/views/:viewId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await deleteDatabaseViewService({
      databaseId: c.req.param("id"),
      env: c.env,
      userId: user.id,
      viewId: c.req.param("viewId"),
    });

    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.post("/:id/properties", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));

  const {
    name = "Property",
    type = "text",
    config = null,
    position,
  } = body as {
    name?: unknown;
    type?: unknown;
    config?: unknown;
    position?: unknown;
  };

  if (typeof name !== "string" || typeof type !== "string") {
    return c.json({ error: "name and type must be strings" }, 400);
  }

  if (
    position !== undefined &&
    (!Number.isInteger(position) || (position as number) < 0)
  ) {
    return c.json({ error: "position must be a non-negative integer" }, 400);
  }

  try {
    const result = await createDatabasePropertyService({
      config,
      databaseId: c.req.param("id"),
      env: c.env,
      name,
      position: position as number | undefined,
      type,
      userId: user.id,
    });

    return c.json(mutationResponse(result.commit), 201);
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.patch("/:id/properties/reorder", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { propertyIds } = body as { propertyIds?: unknown };

  if (
    !Array.isArray(propertyIds) ||
    propertyIds.some((propertyId) => typeof propertyId !== "string")
  ) {
    return c.json({ error: "propertyIds must be an array of strings" }, 400);
  }

  const nextPropertyIds = propertyIds as string[];

  if (hasDuplicateValues(nextPropertyIds)) {
    return c.json({ error: "propertyIds must not contain duplicates" }, 400);
  }

  try {
    const result = await reorderDatabasePropertiesService({
      databaseId: c.req.param("id"),
      env: c.env,
      propertyIds: nextPropertyIds,
      userId: user.id,
    });

    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.patch("/:id/properties/:databasePropertyId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const patch = body as {
    config?: unknown;
    name?: unknown;
    position?: unknown;
    type?: unknown;
  };
  const normalizedPatchType =
    patch.type === undefined
      ? undefined
      : normalizeDatabasePropertyType(patch.type);

  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      return c.json({ error: "name must be a string" }, 400);
    }
  }

  if (patch.type !== undefined) {
    if (typeof patch.type !== "string") {
      return c.json({ error: "type must be a string" }, 400);
    }

    if (!normalizedPatchType) {
      return c.json({ error: "Unsupported property type" }, 400);
    }
  }

  if (patch.position !== undefined) {
    if (!Number.isInteger(patch.position) || (patch.position as number) < 0) {
      return c.json({ error: "position must be a non-negative integer" }, 400);
    }
  }

  try {
    const result = await updateDatabasePropertyService({
      databaseId: c.req.param("id"),
      databasePropertyId: c.req.param("databasePropertyId"),
      env: c.env,
      userId: user.id,
      ...(patch.config !== undefined ? { config: patch.config } : {}),
      ...(patch.name !== undefined ? { name: patch.name as string } : {}),
      ...(patch.position !== undefined
        ? { position: patch.position as number }
        : {}),
      ...(patch.type !== undefined ? { type: patch.type as string } : {}),
    });

    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.post(
  "/:id/properties/:databasePropertyId/duplicate",
  async (c) => {
    const user = requireUser(c);

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));

    const { includeValues = false } = body as { includeValues?: unknown };

    if (typeof includeValues !== "boolean") {
      return c.json({ error: "includeValues must be a boolean" }, 400);
    }

    try {
      const result = await duplicateDatabasePropertyService({
        databaseId: c.req.param("id"),
        databasePropertyId: c.req.param("databasePropertyId"),
        env: c.env,
        includeValues,
        userId: user.id,
      });

      return c.json(mutationResponse(result.commit), 201);
    } catch (error) {
      if (error instanceof ServiceMutationError) {
        return serviceMutationErrorResponse(c, error);
      }

      throw error;
    }
  },
);

databaseRoutes.delete("/:id/properties/:databasePropertyId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await deleteDatabasePropertyService({
      databaseId: c.req.param("id"),
      databasePropertyId: c.req.param("databasePropertyId"),
      env: c.env,
      userId: user.id,
    });

    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }

    throw error;
  }
});

databaseRoutes.post("/:id/rows", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const {
    pageId = null,
    parentRowId = null,
    position,
    sourceDatabaseId = null,
    sourcePropertyMode = "match",
    sourceRowId = null,
    title,
  } = body as {
    pageId?: unknown;
    parentRowId?: unknown;
    position?: unknown;
    sourceDatabaseId?: unknown;
    sourcePropertyMode?: unknown;
    sourceRowId?: unknown;
    title?: unknown;
  };

  if (
    (title !== undefined && typeof title !== "string") ||
    (pageId !== null && typeof pageId !== "string") ||
    (parentRowId !== null && typeof parentRowId !== "string") ||
    (sourceDatabaseId !== null && typeof sourceDatabaseId !== "string") ||
    (sourceRowId !== null && typeof sourceRowId !== "string") ||
    sourcePropertyMode !== "match" ||
    (position !== undefined &&
      (!Number.isInteger(position) || (position as number) < 0))
  ) {
    return c.json({ error: "Invalid row input" }, 400);
  }

  try {
    const result = await createDatabaseRowService({
      databaseId: c.req.param("id"),
      env: c.env,
      pageId: pageId as string | null,
      parentRowId: parentRowId as string | null,
      position: position as number | undefined,
      sourceDatabaseId: sourceDatabaseId as string | null,
      sourcePropertyMode,
      sourceRowId: sourceRowId as string | null,
      title: title as string | undefined,
      userId: user.id,
    });

    return c.json(
      {
        ...mutationResponse(result.commit),
        createdAt: result.createdAt,
        databaseId: result.databaseId,
        isFavorite: result.isFavorite,
        pageId: result.rowPageId,
        parentRowId: result.parentRowId,
        position: result.position,
        rowId: result.rowId,
        title: result.title,
        updatedAt: result.updatedAt,
        values: result.commit.delta.values ?? [],
        ...(result.sourceCommit
          ? { sourceMutation: mutationResponse(result.sourceCommit) }
          : {}),
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

databaseRoutes.patch("/:id/rows/reorder", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
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
  try {
    const result = await reorderDatabaseRowsService({
      databaseId: c.req.param("id"),
      env: c.env,
      rowIds: rowIds as string[],
      userId: user.id,
    });
    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError)
      return serviceMutationErrorResponse(c, error);
    throw error;
  }
});

databaseRoutes.patch("/:id/rows/:rowId/move", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }
  const {
    groupPropertyId,
    groupValue = null,
    rowIds,
  } = body as {
    groupPropertyId?: unknown;
    groupValue?: unknown;
    rowIds?: unknown;
  };
  if (
    !Array.isArray(rowIds) ||
    rowIds.some((rowId) => typeof rowId !== "string") ||
    (groupPropertyId !== undefined && typeof groupPropertyId !== "string")
  ) {
    return c.json({ error: "Invalid row move input" }, 400);
  }
  try {
    const result = await moveDatabaseRowService({
      databaseId: c.req.param("id"),
      env: c.env,
      groupPropertyId: groupPropertyId as string | undefined,
      groupValue,
      rowId: c.req.param("rowId"),
      rowIds: rowIds as string[],
      userId: user.id,
    });
    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError)
      return serviceMutationErrorResponse(c, error);
    throw error;
  }
});

databaseRoutes.put("/:id/rows/:rowId/properties/:propertyId", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }
  const { value = null } = body as { value?: unknown };
  try {
    const result = await setDatabaseCellValueService({
      databaseId: c.req.param("id"),
      env: c.env,
      pagePropertyId: c.req.param("propertyId"),
      rowId: c.req.param("rowId"),
      userId: user.id,
      value,
    });
    return c.json(mutationResponse(result.commit));
  } catch (error) {
    if (error instanceof ServiceMutationError)
      return serviceMutationErrorResponse(c, error);
    throw error;
  }
});
