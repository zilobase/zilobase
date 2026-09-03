import { Hono } from "hono";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { mutationResponse } from "./core/commit";
import { updateDataSourceService } from "./data-sources/data-source-service";
import { createDatabaseDataSourceService, linkDatabaseDataSourceService, replaceDatabaseViewDataSourceService, unlinkDatabaseDataSourceService } from "./data-sources/database-data-source-service";
import { applyDatabaseTemplateService } from "./templates/service";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { updateDatabaseService } from "./core/service";
import { createDatabaseViewService, deleteDatabaseViewService, updateDatabaseViewService } from "./views/service";
import { requireDatabaseRouteUser as requireUser, serviceMutationErrorResponse } from "./route-support";

export const databaseSourceRoutes = new Hono<AppBindings>();

databaseSourceRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

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

databaseSourceRoutes.patch("/data-sources/:dataSourceId", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await readJsonBody(c.req);
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

databaseSourceRoutes.patch("/:id/views/:viewId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

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

databaseSourceRoutes.post("/:id/views", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req, {});
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

databaseSourceRoutes.post("/:id/data-sources/new", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await readJsonBody(c.req);
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

databaseSourceRoutes.post("/:id/data-sources", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await readJsonBody(c.req);
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

databaseSourceRoutes.put("/:id/views/:viewId/source", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await readJsonBody(c.req);
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

databaseSourceRoutes.delete("/:id/data-sources/:dataSourceId", async (c) => {
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

databaseSourceRoutes.delete("/:id/views/:viewId", async (c) => {
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

databaseSourceRoutes.post("/:id/apply-template", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

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

