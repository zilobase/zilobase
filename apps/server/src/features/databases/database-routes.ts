import { Hono } from "hono";

import {
  oauthScopeMiddleware,
  scopeForReadWrite,
} from "../auth/oauth-access";
import type { AppBindings } from "../../shared/types";
import { databaseAutomationRoutes } from "./automations/routes";
import { automationSlackRoutes } from "./automations/slack-routes";
import {
  databaseCoreRoutes,
  databaseCreateRoutes,
} from "./database-core-routes";
import { databaseReadRoutes } from "./database-read-routes";
import { databaseCommandRoutes } from "./database-command-routes";
import { databasePropertyRoutes } from "./database-properties-routes";
import { databaseRowRoutes } from "./database-rows-routes";
import { databaseSourceRoutes } from "./database-sources-routes";

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
databaseRoutes.route("/", databaseSourceRoutes);
databaseRoutes.route("/", databasePropertyRoutes);
databaseRoutes.route("/", databaseRowRoutes);
