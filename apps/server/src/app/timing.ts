import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../shared/types";

export const REQUEST_ID_HEADER = "x-zilobase-request-id";

export const serverTimingMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  c.set("serverTimings", []);
  c.header("x-zilobase-app-path", c.req.path);
  await next();

  const timings = c.get("serverTimings");
  if (timings.length > 0) {
    c.res.headers.append("Server-Timing", timings.join(", "));
  }
};
