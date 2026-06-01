import { Hono } from "hono";
import { cors } from "hono/cors";

import { getClientOrigins } from "./config";
import { sessionMiddleware } from "./middleware/session";
import { aiRoutes } from "./routes/ai";
import { apiKeyRoutes } from "./routes/api-keys";
import { authRoutes } from "./routes/auth";
import { databaseRoutes } from "./routes/databases";
import { healthRoutes } from "./routes/health";
import { metadataRoutes } from "./routes/metadata";
import { organizationSettingsRoutes } from "./routes/organization-settings";
import { organizationRoutes } from "./routes/organizations";
import { searchRoutes } from "./routes/search";
import { sessionRoutes } from "./routes/session";
import { workspaceSettingsRoutes } from "./routes/user-settings";
import { workspaceRoutes } from "./routes/workspaces";
import type { AppBindings } from "./types";

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use(
    "*",
    cors({
      origin: (origin, c) =>
        getClientOrigins(c.env).includes(origin) ? origin : null,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "x-api-key",
        "x-notelab-organization-id",
      ],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
      credentials: true,
    }),
  );

  app.use("*", async (c, next) => {
    if (c.req.path === "/" || c.req.path.startsWith("/api/auth/")) {
      await next();
      return;
    }

    return await sessionMiddleware(c, next);
  });

  app.route("/api/ai", aiRoutes);
  app.route("/api/keys", apiKeyRoutes);
  app.route("/", authRoutes);
  app.route("/databases", databaseRoutes);
  app.route("/", healthRoutes);
  app.route("/metadata", metadataRoutes);
  app.route("/organizations", organizationRoutes);
  app.route("/api/organization/settings", organizationSettingsRoutes);
  app.route("/search", searchRoutes);
  app.route("/session", sessionRoutes);
  app.route("/user-settings", workspaceSettingsRoutes);
  app.route("/workspaces", workspaceRoutes);

  return app;
}
