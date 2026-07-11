import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../types";

export const serverTimingMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  c.set("serverTimings", []);
  c.header("x-notelab-app-path", c.req.path);
  await next();

  const timings = c.get("serverTimings");
  if (timings.length > 0) {
    c.res.headers.append("Server-Timing", timings.join(", "));
  }
};
