import { Hono } from "hono"

import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware"
import {
  oauthScopeMiddleware,
  scopeForReadWrite,
} from "../auth/oauth-access"
import type { AppBindings } from "../../shared/types"
import { readJsonBody } from "../../shared/http/request"
import {
  createDataSourceRealtimeTicket,
  DATA_SOURCE_REALTIME_PROTOCOL,
  DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX,
  verifyDataSourceRealtimeTicket,
} from "../../shared/security/database-realtime-ticket"
import { getDatabaseRealtimeWebSocketUrl } from "../../infrastructure/runtime/runtime-adapter"
import {
  getDataSourceRecord,
  requireDataSourceAccess,
} from "./access/data-source-access"
import {
  DATABASE_MUTATION_FEED_LIMIT,
  getDataSourceMutationFeed,
} from "./history/service"
import { getWorkspaceRealtimeAccessExpiration } from "../access"

export const dataSourceRealtimeRoutes = new Hono<AppBindings>()

dataSourceRealtimeRoutes.use(
  "*",
  oauthScopeMiddleware(
    scopeForReadWrite("databases.read", "databases.write"),
  ),
)

const sourceWorkspace = pinnedResourceMiddleware(
  (id) => getDataSourceRecord(id, { includeDeleted: true }),
  "sourceId",
)

function integerQuery(value: string | undefined, fallback?: number) {
  if (value === undefined) return fallback
  return /^\d+$/.test(value) ? Number(value) : Number.NaN
}

function mutationWindow(after: string | undefined, requestedLimit: string | undefined) {
  const afterVersion = integerQuery(after)
  const limit = integerQuery(requestedLimit, DATABASE_MUTATION_FEED_LIMIT)
  const valid = afterVersion !== undefined && Number.isSafeInteger(afterVersion) &&
    afterVersion >= 0 && limit !== undefined && Number.isSafeInteger(limit) &&
    limit >= 1 && limit <= DATABASE_MUTATION_FEED_LIMIT
  return valid ? { afterVersion, limit } : null
}

function refreshTokenFromBody(body: unknown) {
  if (!body || typeof body !== "object" || !("token" in body)) {
    return { ok: true as const, token: undefined }
  }
  const token = (body as { token?: unknown }).token
  if (typeof token !== "string" || token.length === 0 || token.length > 8 * 1024) {
    return { ok: false as const }
  }
  return { ok: true as const, token }
}

async function restoredSessionId(
  token: string | undefined,
  sourceId: string,
  userId: string,
  env: Parameters<typeof verifyDataSourceRealtimeTicket>[1],
) {
  if (!token) return undefined
  const previous = await verifyDataSourceRealtimeTicket(token, env)
  if (previous.sourceId !== sourceId || previous.user.id !== userId) {
    throw new Error("Realtime session identity changed")
  }
  return previous.sessionId
}

dataSourceRealtimeRoutes.get("/:sourceId/mutations", sourceWorkspace, async (c) => {
  const user = c.get("user") ?? null
  if (!user) return c.json({ error: "Unauthorized" }, 401)
  const source = await requireDataSourceAccess(c.req.param("sourceId"), user.id, "view")
  const window = mutationWindow(
    c.req.query("afterVersion"),
    c.req.query("limit"),
  )
  if (!window) {
    return c.json({ error: "Invalid mutation window" }, 400)
  }
  return c.json(await getDataSourceMutationFeed({
    ...window,
    sourceId: source.id,
  }))
})

dataSourceRealtimeRoutes.post(
  "/:sourceId/realtime-ticket",
  sourceWorkspace,
  async (c) => {
    const user = c.get("user") ?? null
    if (!user || c.get("authMethod") !== "session") {
      return c.json({ error: "Unauthorized" }, 401)
    }
    const source = await requireDataSourceAccess(
      c.req.param("sourceId"),
      user.id,
      "view",
    )
    const body = await readJsonBody(c.req)
    const refresh = refreshTokenFromBody(body)
    if (!refresh.ok) {
      return c.json({ error: "Invalid realtime session" }, 400)
    }

    let sessionId: string | undefined
    try {
      sessionId = await restoredSessionId(
        refresh.token,
        source.id,
        user.id,
        c.env,
      )
    } catch {
      return c.json({ error: "Invalid realtime session" }, 401)
    }

    const editable = await requireDataSourceAccess(source.id, user.id, "edit")
      .then(() => true, () => false)
    const ticket = await createDataSourceRealtimeTicket({
      canEdit: editable,
      sessionId,
      sourceId: source.id,
      sourceVersion: source.version,
      user: {
        email: user.email,
        id: user.id,
        image: user.image,
        name: user.name || user.email,
      },
      workspaceId: source.workspaceId,
    }, c.env, {
      maxExpiresAt: await getWorkspaceRealtimeAccessExpiration(
        source.workspaceId,
        user.id,
      ),
    })
    const websocketUrl = new URL(
      getDatabaseRealtimeWebSocketUrl(c.req.raw, c.env),
    )
    websocketUrl.searchParams.set("source", source.id)
    return c.json({
      ...ticket,
      sourceId: source.id,
      sourceVersion: source.version,
      websocketProtocols: [
        DATA_SOURCE_REALTIME_PROTOCOL,
        `${DATABASE_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.token}`,
      ],
      websocketUrl: websocketUrl.toString(),
    })
  },
)
