import { Hono } from "hono";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { mutationResponse } from "./core/commit";
import { hasDuplicateValues } from "./core/position-service";
import { createDatabasePropertyService, updateDatabasePropertyService } from "./properties/service";
import { deleteDatabasePropertyService, reorderDatabasePropertiesService } from "./properties/structure-service";
import { duplicateDatabasePropertyService } from "./properties/duplication-service";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { normalizeDatabasePropertyType } from "./properties/types";
import { requireDatabaseRouteUser as requireUser, serviceMutationErrorResponse } from "./route-support";

export const databasePropertyRoutes = new Hono<AppBindings>();

databasePropertyRoutes.post("/:id/properties", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req, {});

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

databasePropertyRoutes.patch("/:id/properties/reorder", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

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

databasePropertyRoutes.patch("/:id/properties/:databasePropertyId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

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

databasePropertyRoutes.post(
  "/:id/properties/:databasePropertyId/duplicate",
  async (c) => {
    const user = requireUser(c);

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await readJsonBody(c.req, {});

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

databasePropertyRoutes.delete("/:id/properties/:databasePropertyId", async (c) => {
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

