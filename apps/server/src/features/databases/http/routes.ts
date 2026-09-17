import { Hono } from "hono";

import {
  oauthScopeMiddleware,
  scopeForReadWrite,
} from  "../../auth/oauth-access";
import type { AppBindings } from   "../../../shared/types";
import { databaseAutomationRoutes } from  "../../automations/http/routes";
import { automationSlackRoutes } from  "../../automations/http/slack-routes";
import {
  databaseCoreRoutes,
  databaseCreateRoutes,
} from    "./core-routes";
import { databaseReadRoutes } from    "./read-routes";
import { databaseCommandRoutes } from  "./command-routes";

export const databaseRoutes = new Hono<AppBindings>();

databaseRoutes.use(
  "*",
  oauthScopeMiddleware(
    scopeForReadWrite("databases.read", "databases.write"),
  ),
);

databaseRoutes.route("/", databaseCreateRoutes);
databaseRoutes.route("/", databaseReadRoutes);
databaseRoutes.route("/", databaseCommandRoutes);
databaseRoutes.route("/", databaseAutomationRoutes);
databaseRoutes.route("/", automationSlackRoutes);
databaseRoutes.route("/", databaseCoreRoutes);
