import type { Hono } from "hono";

import { aiRoutes, aiThreadRoutes } from "../features/ai/routes";
import { apiKeyRoutes } from "../features/api-keys/routes";
import { authRoutes } from "../features/auth/routes";
import { sessionRoutes } from "../features/auth/session-routes";
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
import { profileImageRoutes } from "../features/user-settings/profile-image-routes";
import { searchRoutes } from "../features/search/routes";
import { pageSettingsRoutes } from "../features/user-settings";
import { workspaceRoutes } from "../features/workspaces/routes";
import { workspaceSettingsRoutes } from "../features/workspaces/settings/routes";
import type { AppBindings } from "../shared/types";

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
