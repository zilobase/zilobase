import type { Hono } from "hono";

import { aiRoutes, aiThreadRoutes } from "../features/ai/routes";
import {
  apiKeyRoutes,
  authRoutes,
  pageSettingsRoutes,
  sessionRoutes,
} from "../features/auth/routes";
import { commentRoutes } from "../features/comments/routes";
import { databaseRoutes } from "../features/databases/routes";
import { healthRoutes } from "../features/health/routes";
import { imageRoutes } from "../features/images/routes";
import { metadataRoutes } from "../features/metadata/routes";
import { pageRoutes } from "../features/pages/routes";
import { searchRoutes } from "../features/search/routes";
import {
  workspaceRoutes,
  workspaceSettingsRoutes,
} from "../features/workspaces/routes";
import type { AppBindings } from "../types";

export function registerRoutes(app: Hono<AppBindings>) {
  app.route("/api/ai", aiRoutes);
  app.route("/api/ai", aiThreadRoutes);
  app.route("/api/keys", apiKeyRoutes);
  app.route("/", authRoutes);
  app.route("/databases", databaseRoutes);
  app.route("/", healthRoutes);
  app.route("/images", imageRoutes);
  app.route("/metadata", metadataRoutes);
  app.route("/workspaces", workspaceRoutes);
  app.route("/api/workspace/settings", workspaceSettingsRoutes);
  app.route("/", commentRoutes);
  app.route("/search", searchRoutes);
  app.route("/session", sessionRoutes);
  app.route("/user-settings", pageSettingsRoutes);
  app.route("/pages", pageRoutes);
}
