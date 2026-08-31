import type { MiddlewareHandler } from "hono";

import { sessionMiddleware } from "./session-middleware";
import type { AppBindings } from "../../shared/types";

export const authenticatedSessionMiddleware: MiddlewareHandler<AppBindings> =
  async (c, next) => {
    if (
      c.req.path === "/" ||
      c.req.path === "/health" ||
      c.req.path === "/ready" ||
      c.req.path === "/.well-known/zilobase" ||
      c.req.path === "/desktop" ||
      c.req.path === "/api/instance/bootstrap" ||
      c.req.path === "/mail/oauth/google/callback" ||
      c.req.path === "/mail/google/pubsub" ||
      c.req.path.startsWith("/api/auth/")
    ) {
      await next();
      return;
    }

    return sessionMiddleware(c, next);
  };
