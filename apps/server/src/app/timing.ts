import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../shared/types";

export const serverTimingMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  const requestId =
    c.req.header("x-zilobase-request-id") ??
    c.req.header("cf-ray") ??
    crypto.randomUUID();
  c.set("requestId", requestId);
  c.set("serverTimings", []);
  c.header("x-zilobase-app-path", c.req.path);
  c.header("x-zilobase-request-id", requestId);
  await next();

  const timings = c.get("serverTimings");
  if (timings.length > 0) {
    c.res.headers.append("Server-Timing", timings.join(", "));
  }
};
