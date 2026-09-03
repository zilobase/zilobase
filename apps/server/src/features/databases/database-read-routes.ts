import { Hono } from "hono";

import {
  canAccessDatabaseRecord,
  getEffectiveDatabaseAccessForRecord,
  getMembership,
  getWorkspaceRealtimeAccessExpiration,
  isDatabasePublishedInWorkspace,
} from "../access";
import {
  createDatabaseRealtimeTicket,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  DATABASE_REALTIME_PROTOCOL,
  verifyDatabaseRealtimeTicket,
} from "../../shared/security/database-realtime-ticket";
import { getDatabaseRealtimeWebSocketUrl } from "../../infrastructure/runtime/runtime-adapter";
import { getDatabaseRecord } from "./access/database-access";
import {
  getDatabasePayload,
  getDatabaseSchemaPayload,
} from "./core/payload";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";

export const databaseReadRoutes = new Hono<AppBindings>();

databaseReadRoutes.get("/:id", async (c) => {
  const user = c.get("user") ?? null;
  const includeDeleted = c.req.query("includeDeleted") === "1";
  const record = await getDatabaseRecord(c.req.param("id"), {
    includeDeleted,
  });

  if (!record) {
    return c.json({ error: "Database not found" }, 404);
  }

  const canView = record.deletedAt
    ? user
      ? Boolean(await getMembership(record.workspaceId, user.id))
      : false
    : user
      ? await canAccessDatabaseRecord(record, user.id, "view")
      : false;

  if (!canView) {
    const published = await isDatabasePublishedInWorkspace(
      record.id,
      record.workspaceId,
    );

    if (!published) {
      return user
        ? c.json({ error: "Forbidden" }, 403)
        : c.json({ error: "Unauthorized" }, 401);
    }
  }

  const schemaOnly = c.req.query("schemaOnly") === "1";
  const payloadOptions = {
    includeDeleted,
    ...(c.req.query("viewId") ? { viewId: c.req.query("viewId") } : {}),
    ...(c.req.query("dataSourceId")
      ? { dataSourceId: c.req.query("dataSourceId") }
      : {}),
  };
  const payload = schemaOnly
    ? await getDatabaseSchemaPayload(record.id, user?.id, record, payloadOptions)
    : await getDatabasePayload(record.id, user?.id, record, payloadOptions);
  const accessLevel = user
    ? record.deletedAt
      ? "none"
      : await getEffectiveDatabaseAccessForRecord(record, user.id)
    : null;

  return c.json({
    ...payload,
    database: payload ? { ...payload.database, accessLevel } : payload,
  });
});

databaseReadRoutes.post("/:id/realtime-ticket", async (c) => {
  const user = c.get("user") ?? null;

  if (!user || c.get("authMethod") !== "session") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const record = await getDatabaseRecord(c.req.param("id"));
  if (!record) return c.json({ error: "Database not found" }, 404);

  const accessLevel = await getEffectiveDatabaseAccessForRecord(record, user.id);
  if (accessLevel === "none") return c.json({ error: "Forbidden" }, 403);

  const body = await readJsonBody(c.req);
  const hasRefreshToken = Boolean(body && typeof body === "object" && "token" in body);
  const refreshToken =
    hasRefreshToken && typeof (body as { token?: unknown }).token === "string"
      ? (body as { token: string }).token
      : undefined;
  let sessionId: string | undefined;

  if (hasRefreshToken && (!refreshToken || refreshToken.length > 8 * 1024)) {
    return c.json({ error: "Invalid realtime session" }, 400);
  }

  if (refreshToken) {
    try {
      const previous = await verifyDatabaseRealtimeTicket(refreshToken, c.env);
      if (previous.databaseId !== record.id || previous.user.id !== user.id) {
        return c.json({ error: "Invalid realtime session" }, 401);
      }
      sessionId = previous.sessionId;
    } catch {
      return c.json({ error: "Invalid realtime session" }, 401);
    }
  }

  const ticket = await createDatabaseRealtimeTicket(
    {
      canEdit: accessLevel === "edit" || accessLevel === "full",
      databaseId: record.id,
      sessionId,
      user: {
        email: user.email,
        id: user.id,
        image: user.image,
        name: user.name || user.email,
      },
      version: record.version,
      workspaceId: record.workspaceId,
    },
    c.env,
    {
      maxExpiresAt: await getWorkspaceRealtimeAccessExpiration(
        record.workspaceId,
        user.id,
      ),
    },
  );
  const websocketUrl = new URL(getDatabaseRealtimeWebSocketUrl(c.req.raw, c.env));
  websocketUrl.searchParams.set("database", record.id);

  return c.json({
    ...ticket,
    databaseId: record.id,
    version: record.version,
    websocketProtocols: [
      DATABASE_REALTIME_PROTOCOL,
      `${DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.token}`,
    ],
    websocketUrl: websocketUrl.toString(),
  });
});

databaseReadRoutes.get("/:id/published", async (c) => {
  const record = await getDatabaseRecord(c.req.param("id"));
  if (!record) return c.json({ published: false }, 404);

  return c.json({
    published: await isDatabasePublishedInWorkspace(
      record.id,
      record.workspaceId,
    ),
  });
});
