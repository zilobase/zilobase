import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { isDesktopApp } from "@/features/desktop/index";

import { getAuthReturnPath } from "@/features/auth/lib/google-auth";
import { isBootstrapRequiredAuthError } from "@/features/auth/lib/bootstrap-redirect";
import { getConnectivityState } from "@/features/offline/index";
import { getDefaultAppPath, getFreshSession, getWorkspaces } from "../guards";
import { rootRoute } from "../route-roots";
import { validateLoginSearch, validateSignupSearch } from "../search-validators";
import { isHostedDemoRuntime } from "@/features/demo";
import { apiFetch } from "@/features/desktop/network/api";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const session = await getFreshSession({ optional: true });
    if (!session.user) throw redirect({ to: "/login" });

    const workspaces = await getWorkspaces();
    if (isHostedDemoRuntime()) {
      const { startPath } = await apiFetch<{ startPath: string }>(
        "/demo/bootstrap",
        { method: "GET" },
      );
      throw redirect({ href: startPath });
    }
    if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
    throw redirect({ href: await getDefaultAppPath(session, workspaces) });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateLoginSearch,
  beforeLoad: async ({ search }) => {
    if (isBootstrapRequiredAuthError(search.error)) {
      throw redirect({ to: "/setup" });
    }

    const session = await getFreshSession({ optional: true });
    if (!session.user) return;

    if (search.returnTo) {
      throw redirect({
        href: getAuthReturnPath(
          "/recents",
          new URLSearchParams({ returnTo: search.returnTo }).toString(),
        ),
      });
    }

    const workspaces = await getWorkspaces();
    throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" });
  },
  component: lazyRouteComponent(() => import("@/features/auth/pages/login")),
});

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connect",
  beforeLoad: async () => {
    if (!isDesktopApp()) throw redirect({ to: "/login" });

    const session = await getFreshSession({ optional: true });
    if (!session.user || getConnectivityState() !== "online") return;

    const workspaces = await getWorkspaces();
    throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" });
  },
  component: lazyRouteComponent(() => import("@/features/desktop/pages/connect")),
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  validateSearch: validateSignupSearch,
  beforeLoad: async ({ search }) => {
    const session = await getFreshSession({ optional: true });
    if (!session.user) return;

    if (search.returnTo) {
      throw redirect({
        href: getAuthReturnPath(
          "/recents",
          `?returnTo=${encodeURIComponent(search.returnTo)}`,
        ),
      });
    }

    const workspaces = await getWorkspaces();
    throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" });
  },
  component: lazyRouteComponent(() => import("@/features/auth/pages/signup")),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: async () => {
    const session = await getFreshSession();
    if (!session.user) throw redirect({ to: "/login" });

    const workspaces = await getWorkspaces();
    if (workspaces.length > 0) throw redirect({ to: "/recents" });
  },
  component: lazyRouteComponent(() => import("@/features/auth/pages/onboarding")),
});

const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/otp",
  beforeLoad: async () => {
    if (isDesktopApp()) throw redirect({ to: "/login" });
  },
  component: lazyRouteComponent(() => import("@/features/auth/pages/otp")),
});

export const publicRoutes = [
  indexRoute,
  connectRoute,
  loginRoute,
  signupRoute,
  onboardingRoute,
  otpRoute,
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/accept-invitation",
    component: lazyRouteComponent(
      () => import("@/features/workspaces/pages/accept-invitation"),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/accept-page-invitation",
    component: lazyRouteComponent(
      () => import("@/features/pages/invitations/accept-page-invitation"),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
    component: lazyRouteComponent(() => import("@/features/auth/pages/setup")),
  }),
];
