import { Hono } from "hono"

import { isMailFeatureEnabled } from "../../shared/config/config"
import type { AppBindings } from "../../shared/types"
import { mailConnectionRoutes, mailProviderCallbackRoutes } from "./connection-routes"
import { mailMessageRoutes } from "./message-routes"
import { mailOrganizationRoutes, mailViewStatusRoutes } from "./organization-routes"
import { mailQueryRoutes, mailSyncRoutes } from "./query-routes"
import { mailRealtimeRoutes } from "./realtime-routes"
import { workspaceIdFromContext } from "./route-support"

export {
  buildDesktopMailReturnUrl,
  parseMailActionRequest,
  parseMailBatchModifyRequest,
  parseMailLabelWriteRequest,
  parseMailModifyRequest,
} from "./route-support"

export const mailRoutes = new Hono<AppBindings>()
export const mailProviderRoutes = new Hono<AppBindings>()

mailRoutes.use("*", async (c, next) => {
  try {
    if (!isMailFeatureEnabled(c.env) || !workspaceIdFromContext(c)) {
      return c.json({ message: "Not found." }, 404)
    }
    await next()
  } finally {
    c.header("Cache-Control", "private, no-store, max-age=0")
    c.header("Pragma", "no-cache")
    c.header("Referrer-Policy", "no-referrer")
    c.header("X-Content-Type-Options", "nosniff")
  }
})

mailProviderRoutes.use("*", async (c, next) => {
  try {
    if (!isMailFeatureEnabled(c.env)) return c.json({ message: "Not found." }, 404)
    await next()
  } finally {
    c.header("Cache-Control", "private, no-store, max-age=0")
    c.header("Pragma", "no-cache")
    c.header("Referrer-Policy", "no-referrer")
    c.header("X-Content-Type-Options", "nosniff")
  }
})

mailRoutes.route("/", mailConnectionRoutes)
mailRoutes.route("/", mailViewStatusRoutes)
mailRoutes.route("/", mailQueryRoutes)
mailRoutes.route("/", mailOrganizationRoutes)
mailRoutes.route("/", mailSyncRoutes)
mailRoutes.route("/", mailMessageRoutes)
mailRoutes.route("/", mailRealtimeRoutes)
mailProviderRoutes.route("/", mailProviderCallbackRoutes)
