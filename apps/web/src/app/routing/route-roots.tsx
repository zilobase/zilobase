import { createRootRoute, createRoute, Outlet, redirect } from "@tanstack/react-router";

import { getFreshSession, getWorkspaces } from "./guards";
import { AppContentPendingPage } from "./pending-pages";
import { RootRouteShell } from "./route-shell";

export const rootRoute = createRootRoute({ component: RootRouteShell });

export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    const session = await getFreshSession();
    if (!session.user) throw redirect({ to: "/login" });

    const workspaces = await getWorkspaces();
    if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: Outlet,
  pendingComponent: AppContentPendingPage,
});
