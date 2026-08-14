import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import * as z from "zod";

import {
  API_KEY_DEFAULT_EXPIRES_IN_SECONDS,
  API_KEY_PREFIX,
  readApiKeyWorkspaceId,
} from "../api-keys";
import { createAuth } from "../auth";
import { getMembership } from "../access";
import { db } from "../db";
import { apikey } from "../db/schema";
import type { AppBindings } from "../types";

export const apiKeyRoutes = new Hono<AppBindings>();

const createApiKeySchema = z.object({
  expiresIn: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(80),
  workspaceId: z.string().trim().min(1),
});

const updateApiKeySchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => value.enabled !== undefined || value.name !== undefined, {
    message: "At least one field is required",
  });

apiKeyRoutes.get("/", async (c) => {
  const auth = await requireSessionUser(c);

  if ("response" in auth) {
    return auth.response;
  }

  const workspaceId = c.req.query("workspaceId")?.trim();

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  if (!(await getMembership(workspaceId, auth.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await db
    .select()
    .from(apikey)
    .where(eq(apikey.referenceId, auth.user.id));

  return c.json({
    keys: rows
      .filter((row) => readApiKeyWorkspaceId(readMetadata(row.metadata)) === workspaceId)
      .map(toApiKeyPayload),
  });
});

apiKeyRoutes.post("/", async (c) => {
  const authContext = await requireSessionUser(c);

  if ("response" in authContext) {
    return authContext.response;
  }

  const parsed = createApiKeySchema.safeParse(await c.req.json().catch(() => null));

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid API key input",
        message: parsed.error.issues[0]?.message ?? "Invalid API key input",
      },
      400,
    );
  }

  if (!(await getMembership(parsed.data.workspaceId, authContext.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const auth = createAuth(c.env, c.req.raw, undefined, {
    editionExtension: c.get("editionExtension") ?? undefined,
  });
  const key = await auth.api.createApiKey({
    body: {
      expiresIn:
        parsed.data.expiresIn === undefined
          ? API_KEY_DEFAULT_EXPIRES_IN_SECONDS
          : parsed.data.expiresIn,
      metadata: { workspaceId: parsed.data.workspaceId },
      name: parsed.data.name,
      prefix: API_KEY_PREFIX,
      userId: authContext.user.id,
    },
  }).catch((error: unknown) => {
    return {
      error: readApiKeyCreateError(error),
    };
  });

  if ("error" in key) {
    return c.json(
      {
        error: "Invalid API key input",
        message: key.error,
      },
      400,
    );
  }

  return c.json({ key: { ...toApiKeyPayload(key), key: key.key } }, 201);
});

apiKeyRoutes.patch("/:id", async (c) => {
  const auth = await requireSessionUser(c);

  if ("response" in auth) {
    return auth.response;
  }

  const existing = await getOwnedApiKey(c.req.param("id"), auth.user.id);

  if (!existing) {
    return c.json({ error: "API key not found" }, 404);
  }

  const workspaceId = readApiKeyWorkspaceId(readMetadata(existing.metadata));

  if (!workspaceId || !(await getMembership(workspaceId, auth.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const parsed = updateApiKeySchema.safeParse(await c.req.json().catch(() => null));

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid API key input",
        message: parsed.error.issues[0]?.message ?? "Invalid API key input",
      },
      400,
    );
  }

  const [updated] = await db
    .update(apikey)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(and(eq(apikey.id, existing.id), eq(apikey.referenceId, auth.user.id)))
    .returning();

  return c.json({ key: toApiKeyPayload(updated) });
});

apiKeyRoutes.delete("/:id", async (c) => {
  const auth = await requireSessionUser(c);

  if ("response" in auth) {
    return auth.response;
  }

  const existing = await getOwnedApiKey(c.req.param("id"), auth.user.id);

  if (!existing) {
    return c.json({ error: "API key not found" }, 404);
  }

  const workspaceId = readApiKeyWorkspaceId(readMetadata(existing.metadata));

  if (!workspaceId || !(await getMembership(workspaceId, auth.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .delete(apikey)
    .where(and(eq(apikey.id, existing.id), eq(apikey.referenceId, auth.user.id)));

  return c.json({ deleted: true });
});

async function requireSessionUser(c: Context<AppBindings>) {
  const requestUser = c.get("user");

  if (!requestUser) {
    return { response: c.json({ error: "Unauthorized" }, 401) };
  }

  if (c.get("authMethod") === "apiKey") {
    return {
      response: c.json(
        { error: "API keys cannot manage API keys" },
        403,
      ),
    };
  }

  return { user: requestUser };
}

async function getOwnedApiKey(id: string, userId: string) {
  const [record] = await db
    .select()
    .from(apikey)
    .where(and(eq(apikey.id, id), eq(apikey.referenceId, userId)))
    .limit(1);

  return record ?? null;
}

type ApiKeyRecord = Omit<typeof apikey.$inferSelect, "metadata"> & {
  metadata: unknown;
};

function toApiKeyPayload(record: ApiKeyRecord) {
  return {
    createdAt: record.createdAt.toISOString(),
    enabled: record.enabled,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    id: record.id,
    lastRequest: record.lastRequest?.toISOString() ?? null,
    name: record.name ?? "",
    workspaceId: readApiKeyWorkspaceId(readMetadata(record.metadata)),
    prefix: record.prefix,
    requestCount: record.requestCount,
    start: record.start,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function readMetadata(value: unknown) {
  if (value && typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readApiKeyCreateError(error: unknown) {
  if (error && typeof error === "object") {
    const body = (error as { body?: { message?: unknown } }).body;
    const message = body?.message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return "Failed to create API key.";
}
