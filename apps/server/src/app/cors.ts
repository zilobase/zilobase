import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

import { isAllowedClientOrigin, isLocalDevelopmentHost } from "../config";
import type { AppBindings } from "../types";

export function createCorsMiddleware(): MiddlewareHandler<AppBindings> {
  return cors({
    origin: (origin, c) => {
      const requestUrl = new URL(c.req.url);

      if (isLocalDevelopmentHost(requestUrl.hostname)) {
        return origin ?? null;
      }

      return isAllowedClientOrigin(c.env, origin) ? origin : null;
    },
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "x-mobile-auth-cookie",
      "x-notelab-workspace-id",
      "Content-Length",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  });
}
