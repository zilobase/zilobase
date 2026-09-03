import { Hono } from "hono";

import type { AppBindings } from "../../shared/types";
import {
  pageBrowseDetailRoutes,
  pageBrowseRoutes,
} from "./page-browse-routes";
import { pageContentRoutes } from "./page-content-routes";
import { pageHierarchyRoutes } from "./page-hierarchy-routes";
import { pageLifecycleRoutes } from "./page-lifecycle-routes";
import { pageSharingRoutes, pageVisitRoutes } from "./page-sharing-routes";

export const pageRoutes = new Hono<AppBindings>();

pageRoutes.route("/", pageBrowseRoutes);
pageRoutes.route("/", pageVisitRoutes);
pageRoutes.route("/", pageHierarchyRoutes);
pageRoutes.route("/", pageBrowseDetailRoutes);
pageRoutes.route("/", pageSharingRoutes);
pageRoutes.route("/", pageContentRoutes);
pageRoutes.route("/", pageLifecycleRoutes);
