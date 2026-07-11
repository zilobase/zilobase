import type { MiddlewareHandler } from "hono";

import { sessionMiddleware } from "../middleware/session";
import type { AppBindings } from "../types";

export const authenticatedSessionMiddleware: MiddlewareHandler<AppBindings> =
  async (c, next) => {
    if (c.req.path === "/" || c.req.path.startsWith("/api/auth/")) {
      await next();
      return;
    }

    return sessionMiddleware(c, next);
  };
