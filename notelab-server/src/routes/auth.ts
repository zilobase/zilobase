import { Hono } from "hono";
import { auth } from "../auth";
import type { AppBindings } from "../types";

export const authRoutes = new Hono<AppBindings>();

authRoutes.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});
