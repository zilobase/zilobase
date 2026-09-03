import { createRouter, lazyRouteComponent } from "@tanstack/react-router";

import { PendingPage } from "./pending-page";
import { appRoutes } from "./route-groups/app-routes";
import { contentRoutes } from "./route-groups/content-routes";
import { publicRoutes } from "./route-groups/public-routes";
import { settingsRoutes } from "./route-groups/settings-routes";
import { appRoute, rootRoute } from "./route-roots";

const routeTree = rootRoute.addChildren([
  ...publicRoutes,
  appRoute.addChildren([...appRoutes, ...settingsRoutes]),
  ...contentRoutes,
]);

export const router = createRouter({
  routeTree,
  defaultErrorComponent: lazyRouteComponent(() => import("./route-error-page")),
  defaultPendingComponent: PendingPage,
  defaultPendingMinMs: 300,
  defaultPendingMs: 250,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
