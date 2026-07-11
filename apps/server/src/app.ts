import { Hono } from "hono";
import { createCorsMiddleware } from "./app/cors";
import { registerRoutes } from "./app/routes";
import { authenticatedSessionMiddleware } from "./app/session";
import { serverTimingMiddleware } from "./app/timing";
import type { AppBindings } from "./types";

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use("*", createCorsMiddleware());
  app.use("*", serverTimingMiddleware);
  app.use("*", authenticatedSessionMiddleware);
  registerRoutes(app);

  return app;
}
