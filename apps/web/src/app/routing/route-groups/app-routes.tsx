import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { isFeatureEnabled } from "@/shared/config/feature-flags";
import { appRoute } from "../route-roots";
import { validateAiSearch, validateLibrarySearch, validateMailSearch } from "../search-validators";

export const appRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/ai",
    validateSearch: validateAiSearch,
    component: lazyRouteComponent(() => import("@/features/ai/pages/ai")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/canvas",
    component: lazyRouteComponent(() => import("@/features/canvas/pages/canvas")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/recents",
    validateSearch: validateLibrarySearch,
    component: lazyRouteComponent(() => import("@/features/library/pages/recents")),
  }),
  ...(isFeatureEnabled("mail")
    ? [createRoute({
        getParentRoute: () => appRoute,
        path: "/mail",
        validateSearch: validateMailSearch,
        component: lazyRouteComponent(() => import("@/features/mail/pages/mail")),
      })]
    : []),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/tasks",
    component: lazyRouteComponent(() => import("@/features/tasks/pages/tasks")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/trash",
    component: lazyRouteComponent(() => import("@/features/library/pages/trash")),
  }),
];
