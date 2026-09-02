import { Hono } from "hono";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import type { AppBindings } from "../../shared/types";
import { mutationResponse } from "./core/commit";
import { getDatabasePayload } from "./core/payload";
import { updateDataSourceService } from "./data-sources/data-source-service";
import {
  createDatabaseDataSourceService,
  linkDatabaseDataSourceService,
  replaceDatabaseViewDataSourceService,
  unlinkDatabaseDataSourceService,
} from "./data-sources/database-data-source-service";
import { hasDuplicateValues } from "./core/position-service";
import { updateDatabaseFavoriteService } from "./core/favorite-service";
import {
  createDatabasePropertyService,
  updateDatabasePropertyService,
} from "./properties/service";
import {
  deleteDatabasePropertyService,
  reorderDatabasePropertiesService,
} from "./properties/structure-service";
import { duplicateDatabasePropertyService } from "./properties/duplication-service";
import { createDatabaseRowService } from "./rows/service";
import { setDatabaseCellValueService } from "./properties/cell-service";
import { applyDatabaseTemplateService } from "./templates/service";
import {
  moveDatabaseRowService,
  reorderDatabaseRowsService,
} from "./rows/position-service";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import {
  deleteDatabaseAccessRuleService,
  deletePublicDatabaseAccessService,
  listDatabaseAccessRulesService,
  upsertDatabaseAccessRuleService,
} from "./sharing/service";
import {
  createDatabaseService,
  deleteDatabaseService,
  restoreDatabaseService,
  updateDatabaseService,
} from "./core/service";
import {
  createDatabaseViewService,
  deleteDatabaseViewService,
  updateDatabaseViewService,
} from "./views/service";
import { normalizeDatabasePropertyType } from "./properties/types";
import { databaseReadRoutes } from "./database-read-routes";
import { databaseAutomationRoutes } from "./automations/routes";
import {
  requireDatabaseRouteUser as requireUser,
  serviceMutationErrorResponse,
} from "./route-support";

export const databaseRoutes = new Hono<AppBindings>();

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

databaseRoutes.route("/", databaseReadRoutes);
databaseRoutes.route("/", databaseAutomationRoutes);

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

databaseRoutes.delete("/:id/access/public", async (c) => {
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

databaseRoutes.delete("/:id/access/:ruleId", async (c) => {
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

databaseRoutes.post("/:id/restore", async (c) => {
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

databaseRoutes.patch("/data-sources/:dataSourceId", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }
  const { config, name } = body as { config?: unknown; name?: unknown };
  if (name !== undefined && typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }

  try {
    const result = await updateDataSourceService({
      config,
      dataSourceId: c.req.param("dataSourceId"),
      env: c.env,
      ...(typeof name === "string" ? { name } : {}),
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
    dataSourceId,
    name = "Table",
    type = "table",
  } = body as {
    config?: unknown;
    dataSourceId?: unknown;
    name?: unknown;
    type?: unknown;
  };

  if (typeof name !== "string" || typeof type !== "string") {
    return c.json({ error: "name and type must be strings" }, 400);
  }
  if (typeof dataSourceId !== "string" || dataSourceId.length === 0) {
    return c.json({ error: "dataSourceId is required" }, 400);
  }

  try {
    const result = await createDatabaseViewService({
      config,
      databaseId: c.req.param("id"),
      dataSourceId,
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

databaseRoutes.post("/:id/data-sources/new", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }
  const { config, name, viewName, viewType } = body as Record<string, unknown>;
  if (name !== undefined && typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }
  if (viewName !== undefined && typeof viewName !== "string") {
    return c.json({ error: "viewName must be a string" }, 400);
  }
  if (viewType !== undefined && typeof viewType !== "string") {
    return c.json({ error: "viewType must be a string" }, 400);
  }

  try {
    const result = await createDatabaseDataSourceService({
      config,
      databaseId: c.req.param("id"),
      env: c.env,
      ...(typeof name === "string" ? { name } : {}),
      userId: user.id,
      ...(typeof viewName === "string" ? { viewName } : {}),
      ...(typeof viewType === "string" ? { viewType } : {}),
    });
    return c.json(result.payload, 201);
  } catch (error) {
    if (error instanceof ServiceMutationError) {
      return serviceMutationErrorResponse(c, error);
    }
    throw error;
  }
});

databaseRoutes.post("/:id/data-sources", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }
  const { config, dataSourceId, name, type } = body as Record<string, unknown>;
  if (typeof dataSourceId !== "string" || dataSourceId.length === 0) {
    return c.json({ error: "dataSourceId must be a string" }, 400);
  }
  if (name !== undefined && typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }
  if (type !== undefined && typeof type !== "string") {
    return c.json({ error: "type must be a string" }, 400);
  }

  try {
    const result = await linkDatabaseDataSourceService({
      config,
      databaseId: c.req.param("id"),
      dataSourceId,
      env: c.env,
      ...(typeof name === "string" ? { name } : {}),
      ...(typeof type === "string" ? { type } : {}),
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

databaseRoutes.put("/:id/views/:viewId/source", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null);
  const dataSourceId =
    body && typeof body === "object"
      ? (body as { dataSourceId?: unknown }).dataSourceId
      : undefined;
  if (typeof dataSourceId !== "string" || dataSourceId.length === 0) {
    return c.json({ error: "dataSourceId must be a string" }, 400);
  }

  try {
    const result = await replaceDatabaseViewDataSourceService({
      databaseId: c.req.param("id"),
      dataSourceId,
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

databaseRoutes.delete("/:id/data-sources/:dataSourceId", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const result = await unlinkDatabaseDataSourceService({
      databaseId: c.req.param("id"),
      dataSourceId: c.req.param("dataSourceId"),
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

databaseRoutes.post("/:id/apply-template", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { config, name, properties, rows } = body as {
    config?: unknown;
    name?: unknown;
    properties?: unknown;
    rows?: unknown;
  };
  const hasInvalidProperty =
    !Array.isArray(properties) ||
    properties.length > 50 ||
    properties.some(
      (property) =>
        !property ||
        typeof property !== "object" ||
        typeof (property as { name?: unknown }).name !== "string" ||
        typeof (property as { type?: unknown }).type !== "string",
    );
  const hasInvalidRow =
    !Array.isArray(rows) ||
    rows.length > 100 ||
    rows.some((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        typeof (row as { title?: unknown }).title !== "string" ||
        !Array.isArray((row as { values?: unknown }).values)
      ) {
        return true;
      }

      return (row as { values: unknown[] }).values.some(
        (value) =>
          !value ||
          typeof value !== "object" ||
          typeof (value as { propertyName?: unknown }).propertyName !==
            "string" ||
          !("value" in value),
      );
    });

  if (typeof name !== "string" || hasInvalidProperty || hasInvalidRow) {
    return c.json({ error: "Invalid database template input" }, 400);
  }

  try {
    const result = await applyDatabaseTemplateService({
      config: config ?? null,
      databaseId: c.req.param("id"),
      env: c.env,
      name,
      properties: properties as Array<{
        config?: unknown;
        name: string;
        type: string;
      }>,
      rows: rows as Array<{
        content?: unknown;
        metadata?: unknown;
        title: string;
        values: Array<{ propertyName: string; value: unknown }>;
      }>,
      userId: user.id,
    });

    return c.json(result.payload);
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
    sourceDataSourceId = null,
    sourcePropertyMode = "match",
    sourceRowId = null,
    title,
  } = body as {
    pageId?: unknown;
    parentRowId?: unknown;
    position?: unknown;
    sourceDataSourceId?: unknown;
    sourcePropertyMode?: unknown;
    sourceRowId?: unknown;
    title?: unknown;
  };

  if (
    (title !== undefined && typeof title !== "string") ||
    (pageId !== null && typeof pageId !== "string") ||
    (parentRowId !== null && typeof parentRowId !== "string") ||
    (sourceDataSourceId !== null && typeof sourceDataSourceId !== "string") ||
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
      origin: c.get("authMethod") === "apiKey" ? "api" : "user",
      pageId: pageId as string | null,
      parentRowId: parentRowId as string | null,
      position: position as number | undefined,
      sourceDataSourceId: sourceDataSourceId as string | null,
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
        dataSourceId: result.dataSourceId,
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
      origin: c.get("authMethod") === "apiKey" ? "api" : "user",
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
      origin: c.get("authMethod") === "apiKey" ? "api" : "user",
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
