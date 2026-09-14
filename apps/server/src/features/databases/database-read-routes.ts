import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { Hono, type Context } from "hono";

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
import { getDatabaseSchemaPayload } from "./core/payload";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import {
  DatabaseWindowStaleError,
  MAX_DATABASE_RECORD_WINDOW_LIMIT,
  getDatabaseBootstrapService,
  getDatabaseExportService,
  getDatabaseRecordWindowService,
} from "./read/service";
import {
  DATABASE_MUTATION_FEED_LIMIT,
  getDatabaseMutationFeed,
} from "./history/service";

export const databaseReadRoutes = new Hono<AppBindings>();
const resourceWorkspace = pinnedResourceMiddleware((id) => getDatabaseRecord(id, { includeDeleted: true }));

async function readableDatabase(
  c: Context<AppBindings>,
  databaseId: string,
  includeDeleted: boolean,
) {
  const user = c.get("user") ?? null;
  const record = await getDatabaseRecord(databaseId, { includeDeleted });

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

  const accessLevel = user
    ? record.deletedAt
      ? null
      : await getEffectiveDatabaseAccessForRecord(record, user.id)
    : null;

  return {
    accessLevel: accessLevel === "none" || accessLevel === "comment"
      ? accessLevel === "comment" ? "view" as const : null
      : accessLevel,
    record,
    user,
  };
}

function integerQuery(value: string | undefined, fallback?: number) {
  if (value === undefined) return fallback;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

databaseReadRoutes.get("/:id/bootstrap", resourceWorkspace, async (c) => {
  const includeDeleted = c.req.query("includeDeleted") === "1";
  const readable = await readableDatabase(c, c.req.param("id"), includeDeleted);
  if (readable instanceof Response) return readable;

  const bootstrap = await getDatabaseBootstrapService({
    accessLevel: readable.accessLevel,
    databaseId: readable.record.id,
    existingRecord: readable.record,
    includeDeleted,
    userId: readable.user?.id,
    viewId: c.req.query("viewId") || undefined,
  });
  return c.json(bootstrap);
});

databaseReadRoutes.get("/:id/export", resourceWorkspace, async (c) => {
  const readable = await readableDatabase(c, c.req.param("id"), false);
  if (readable instanceof Response) return readable;
  const dataSourceId = c.req.query("dataSourceId") || undefined;
  if (dataSourceId && dataSourceId.length > 128) {
    return c.json({ error: "Invalid data source" }, 400);
  }
  const payload = await getDatabaseExportService({
    dataSourceId,
    databaseId: readable.record.id,
    existingRecord: readable.record,
    userId: readable.user?.id,
  });
  return c.json(payload);
});

databaseReadRoutes.get(
  "/:id/data-sources/:dataSourceId/records",
  resourceWorkspace,
  async (c) => {
    const includeDeleted = c.req.query("includeDeleted") === "1";
    const readable = await readableDatabase(c, c.req.param("id"), includeDeleted);
    if (readable instanceof Response) return readable;

    const snapshot = c.req.query("snapshot") || undefined;
    if (snapshot && snapshot.length > 2_048) {
      return c.json({ error: "Invalid snapshot" }, 400);
    }
    const offset = integerQuery(c.req.query("offset"), 0);
    const limit = integerQuery(c.req.query("limit"));
    if (
      offset === undefined || !Number.isSafeInteger(offset) || offset < 0 ||
      (limit !== undefined &&
        (!Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > MAX_DATABASE_RECORD_WINDOW_LIMIT))
    ) {
      return c.json({ error: "Invalid record window" }, 400);
    }

    try {
      const window = await getDatabaseRecordWindowService({
        databaseId: readable.record.id,
        dataSourceId: c.req.param("dataSourceId"),
        existingRecord: readable.record,
        includeDeleted,
        limit,
        offset,
        snapshot,
        userId: readable.user?.id,
        viewId: c.req.query("viewId") || undefined,
      });
      return c.json(window);
    } catch (error) {
      if (error instanceof DatabaseWindowStaleError) {
        return c.json({
          code: error.code,
          currentSnapshot: error.currentSnapshot,
          error: error.message,
        }, 409);
      }
      throw error;
    }
  },
);

databaseReadRoutes.get("/:id/mutations", resourceWorkspace, async (c) => {
  const readable = await readableDatabase(c, c.req.param("id"), false);
  if (readable instanceof Response) return readable;
  const afterVersion = integerQuery(c.req.query("afterVersion"));
  const limit = integerQuery(c.req.query("limit"), DATABASE_MUTATION_FEED_LIMIT);
  if (
    afterVersion === undefined || !Number.isSafeInteger(afterVersion) || afterVersion < 0 ||
    limit === undefined || !Number.isSafeInteger(limit) || limit < 1 ||
    limit > DATABASE_MUTATION_FEED_LIMIT
  ) {
    return c.json({ error: "Invalid mutation window" }, 400);
  }
  return c.json(await getDatabaseMutationFeed({
    afterVersion,
    databaseId: readable.record.id,
    limit,
  }));
});


databaseReadRoutes.get("/:id", resourceWorkspace, async (c) => {
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

  const payloadOptions = {
    includeDeleted,
    ...(c.req.query("viewId") ? { viewId: c.req.query("viewId") } : {}),
    ...(c.req.query("dataSourceId")
      ? { dataSourceId: c.req.query("dataSourceId") }
      : {}),
  };
  const payload = await getDatabaseSchemaPayload(
    record.id,
    user?.id,
    record,
    payloadOptions,
  );
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

databaseReadRoutes.post("/:id/realtime-ticket", resourceWorkspace, async (c) => {
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

databaseReadRoutes.get("/:id/published", resourceWorkspace, async (c) => {
  const record = await getDatabaseRecord(c.req.param("id"));
  if (!record) return c.json({ published: false }, 404);

  return c.json({
    published: await isDatabasePublishedInWorkspace(
      record.id,
      record.workspaceId,
    ),
  });
});
