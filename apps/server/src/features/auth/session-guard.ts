import { createMiddleware } from "hono/factory";

import { sessionMiddleware } from "./session-middleware";
import type { AppBindings } from "../../shared/types";
import { isHostedDemoRequest } from "../demo/request";

export const authenticatedSessionMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  if (isHostedDemoRequest(c.env, c.req.raw.headers)) {
    return sessionMiddleware(c, next);
  }

  if (
    c.req.path === "/" ||
    c.req.path === "/health" ||
    c.req.path === "/ready" ||
    c.req.path.startsWith("/.well-known/") ||
    c.req.path === "/desktop" ||
    c.req.path === "/api/instance/bootstrap" ||
    c.req.path === "/calendar/oauth/google/callback" ||
    c.req.path === "/calendar/google/webhook" ||
    c.req.path.startsWith("/api/auth/")
  ) {
    await next();
    return;
  }

  return sessionMiddleware(c, next);
});
