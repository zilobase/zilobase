import type { Hono } from "hono";

import { aiRoutes, aiThreadRoutes } from "../features/ai/routes";
import {
  apiKeyRoutes,
  authRoutes,
  pageSettingsRoutes,
  sessionRoutes,
} from "../features/auth/routes";
import { databaseRoutes } from "../features/databases/routes";
import { desktopAuthRoutes } from "../features/desktop-auth/routes";
import { healthRoutes } from "../features/health/routes";
import { imageRoutes } from "../features/images/routes";
import { instanceRoutes } from "../features/instance/routes";
import { metadataRoutes } from "../features/metadata/routes";
import { meetingRoutes } from "../features/meetings/routes";
import { pageRoutes } from "../features/pages/routes";
import { pageGuestRoutes } from "../features/page-guests";
import { pageLayoutRoutes } from "../features/page-layouts/routes";
import { teamspaceRoutes } from "../features/teamspaces/routes";
import { profileImageRoutes } from "../routes/profile-images";
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
  app.route("/", desktopAuthRoutes);
  app.route("/", authRoutes);
  app.route("/databases", databaseRoutes);
  app.route("/", healthRoutes);
  app.route("/", instanceRoutes);
  app.route("/images", imageRoutes);
  app.route("/metadata", metadataRoutes);
  app.route("/meetings", meetingRoutes);
  app.route("/workspaces", workspaceRoutes);
  app.route("/workspaces", teamspaceRoutes);
  app.route("/api/workspace/settings", workspaceSettingsRoutes);
  app.route("/search", searchRoutes);
  app.route("/session", sessionRoutes);
  app.route("/user-settings", pageSettingsRoutes);
  app.route("/user-settings/profile", profileImageRoutes);
  app.route("/", pageGuestRoutes);
  app.route("/pages", pageRoutes);
  app.route("/page-layouts", pageLayoutRoutes);
}
