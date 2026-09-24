import { Hono } from "hono";

import type { AppBindings } from "../../shared/types";
import { mailConnectionRoutes, mailProviderCallbackRoutes } from "./connections/routes";
import { mailMessageRoutes } from "./compose/routes";
import { mailOrganizationRoutes, mailViewStatusRoutes } from "./organization/routes";
import { mailQueryRoutes, mailSyncRoutes } from "./query/routes";
import { mailRealtimeRoutes } from "./realtime/routes";
import { workspaceIdFromContext } from "./route-support";

export {
  buildDesktopMailReturnUrl,
  parseMailActionRequest,
  parseMailBatchModifyRequest,
  parseMailLabelWriteRequest,
  parseMailModifyRequest,
} from "./route-support";

export const mailRoutes = new Hono<AppBindings>();
export const mailProviderRoutes = new Hono<AppBindings>();

mailRoutes.use("*", async (c, next) => {
  if (!workspaceIdFromContext(c)) {
    return c.json({ message: "Not found." }, 404);
  }
  await next();
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
});

mailProviderRoutes.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
});

mailRoutes.route("/", mailConnectionRoutes);
mailRoutes.route("/", mailViewStatusRoutes);
mailRoutes.route("/", mailQueryRoutes);
mailRoutes.route("/", mailOrganizationRoutes);
mailRoutes.route("/", mailSyncRoutes);
mailRoutes.route("/", mailMessageRoutes);
mailRoutes.route("/", mailRealtimeRoutes);
mailProviderRoutes.route("/", mailProviderCallbackRoutes);
