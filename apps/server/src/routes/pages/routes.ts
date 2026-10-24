import { createContentVerificationRoutes } from "../content/verification-routes";
import { Hono } from "hono";
import { getPageIncludingDeleted } from "../../services/pages/read/page-records";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { pageNavigationRoutes } from "./navigation/routes";

import type { AppBindings } from "../../shared/contracts/http";
import { oauthScopeMiddleware, scopeForReadWrite } from "../auth/oauth/oauth-access";
import { pageContentRoutes } from "./content/routes";
import { pageHierarchyRoutes } from "./hierarchy/routes";
import { pageLifecycleRoutes } from "./lifecycle/routes";
import { pageVisitRoutes } from "./navigation/routes";
import { pageBrowseDetailRoutes, pageBrowseRoutes } from "./read/routes";
import { pageSharingRoutes } from "./sharing/routes";

export const pageRoutes = new Hono<AppBindings>();

pageRoutes.use("*", oauthScopeMiddleware(scopeForReadWrite("pages.read", "pages.write")));

pageRoutes.route("/", pageBrowseRoutes);
pageRoutes.route("/", pageVisitRoutes);
pageRoutes.use("/:id/*", pinnedResourceMiddleware(getPageIncludingDeleted));
pageRoutes.route("/", pageHierarchyRoutes);
pageRoutes.route("/", pageBrowseDetailRoutes);
pageRoutes.route("/", pageNavigationRoutes);
pageRoutes.route("/", pageSharingRoutes);
pageRoutes.route("/", pageContentRoutes);
pageRoutes.route("/", pageLifecycleRoutes);

pageRoutes.route("/", createContentVerificationRoutes("page"));
