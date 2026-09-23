import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { isFeatureEnabled } from "@/shared/config/feature-flags";
import { appRoute } from "../route-roots";
import { validateCalendarSearch, validateAiSearch, validateLibrarySearch, validateMailSearch } from "../search-validators";

export const appRoutes = [
  ...(isFeatureEnabled("calendar") ? [createRoute({ getParentRoute: () => appRoute, path: "/calendar", validateSearch: validateCalendarSearch, component: lazyRouteComponent(() => import("@/features/calendar/screens/calendar")) })] : []),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/ai",
    validateSearch: validateAiSearch,
    component: lazyRouteComponent(() => import("@/features/ai/screens/ai")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/agents/$agentId",
    component: lazyRouteComponent(() => import("@/features/ai/screens/custom-agent")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/canvas",
    component: lazyRouteComponent(() => import("@/features/canvas/screens/canvas")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/recents",
    validateSearch: validateLibrarySearch,
    component: lazyRouteComponent(() => import("@/features/library/screens/recents")),
  }),
  ...(isFeatureEnabled("mail")
    ? [createRoute({
        getParentRoute: () => appRoute,
        path: "/mail",
        validateSearch: validateMailSearch,
        component: lazyRouteComponent(() => import("@/features/mail/screens/mail")),
      })]
    : []),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/tasks",
    component: lazyRouteComponent(() => import("@/features/tasks/screens/tasks")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/trash",
    beforeLoad: () => {
      throw redirect({ search: { view: "trash" }, to: "/recents" });
    },
  }),
];
