import { Hono } from "hono";
import type { AppBindings } from "../../shared/types";
import { createMailRealtimeTicket, MAIL_REALTIME_AUTH_PROTOCOL_PREFIX, MAIL_REALTIME_PROTOCOL } from "./mail-realtime-ticket";
import { getMailRealtimeWebSocketUrl } from "../../infrastructure/runtime/runtime-adapter";
import { requireOwnedConnection } from "./route-support";

export const mailRealtimeRoutes = new Hono<AppBindings>();

mailRealtimeRoutes.post("/realtime-ticket", async (c) => {
  const owned = await requireOwnedConnection(c)
  if (owned instanceof Response) return owned
  const ticket = await createMailRealtimeTicket({
    bindingId: owned.bindingId,
    connectionId: owned.connection.id,
    userId: owned.userId,
    workspaceId: owned.workspaceId,
  }, c.env)
  const websocketUrl = new URL(getMailRealtimeWebSocketUrl(c.req.raw, c.env))
  websocketUrl.searchParams.set("binding", owned.bindingId)
  return c.json({
    ...ticket,
    websocketProtocols: [
      MAIL_REALTIME_PROTOCOL,
      `${MAIL_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.ticket}`,
    ],
    websocketUrl: websocketUrl.toString(),
  })
})

