import { Hono } from "hono";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { getPageIncludingDeleted } from "./page-route-support";

import { oauthScopeMiddleware, scopeForReadWrite } from "../auth/oauth-access";
import type { AppBindings } from "../../shared/types";
import { pageBrowseDetailRoutes, pageBrowseRoutes } from "./page-browse-routes";
import { pageContentRoutes } from "./page-content-routes";
import { pageHierarchyRoutes } from "./page-hierarchy-routes";
import { pageLifecycleRoutes } from "./page-lifecycle-routes";
import { pageSharingRoutes, pageVisitRoutes } from "./page-sharing-routes";

export const pageRoutes = new Hono<AppBindings>();

pageRoutes.use("*", oauthScopeMiddleware(scopeForReadWrite("pages.read", "pages.write")));

pageRoutes.route("/", pageBrowseRoutes);
pageRoutes.route("/", pageVisitRoutes);
pageRoutes.use("/:id/*", pinnedResourceMiddleware(getPageIncludingDeleted));
pageRoutes.route("/", pageHierarchyRoutes);
pageRoutes.route("/", pageBrowseDetailRoutes);
pageRoutes.route("/", pageSharingRoutes);
pageRoutes.route("/", pageContentRoutes);
pageRoutes.route("/", pageLifecycleRoutes);
