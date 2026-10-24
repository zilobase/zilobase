import { createContentVerificationRoutes } from "../content/verification-routes";
import { Hono } from "hono";

import type { AppBindings } from "../../shared/contracts/http";
import { oauthScopeMiddleware, scopeForReadWrite } from "../auth/oauth/oauth-access";
import { databaseAutomationRoutes } from "../automations/routes";
import { automationSlackRoutes } from "../automations/slack-routes";
import { databaseCommandRoutes } from "./command-routes";
import { databaseCoreRoutes } from "./core-routes";
import { databaseReadRoutes } from "./read-routes";

export const databaseRoutes = new Hono<AppBindings>();

databaseRoutes.use(
  "*",
  oauthScopeMiddleware(scopeForReadWrite("databases.read", "databases.write")),
);

databaseRoutes.route("/", databaseReadRoutes);
databaseRoutes.route("/", databaseCommandRoutes);
databaseRoutes.route("/", databaseAutomationRoutes);
databaseRoutes.route("/", automationSlackRoutes);
databaseRoutes.route("/", databaseCoreRoutes);

databaseRoutes.route("/", createContentVerificationRoutes("database"));
