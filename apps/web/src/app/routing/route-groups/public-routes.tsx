import { createRoute, redirect } from "@tanstack/react-router";
import { isDesktopApp } from "@/features/desktop/index";

import { AcceptWorkspaceInvitationPage } from "@/features/workspaces";
import { AcceptPageInvitationPage } from "@/features/pages";
import { ConnectPage } from "@/features/desktop/pages/index";
import {
  getAuthReturnPath,
  LoginPage,
  OnboardingPage,
  OtpPage,
  SetupPage,
  SignupPage,
} from "@/features/auth";
import { getConnectivityState } from "@/features/offline/index";
import { getDefaultAppPath, getFreshSession, getWorkspaces } from "../guards";
import { rootRoute } from "../route-roots";
import { validateLoginSearch, validateSignupSearch } from "../search-validators";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const session = await getFreshSession({ optional: true });
    if (!session.user) throw redirect({ to: "/login" });

    const workspaces = await getWorkspaces();
    if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
    throw redirect({ href: await getDefaultAppPath(session, workspaces) });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateLoginSearch,
  beforeLoad: async ({ search }) => {
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
  component: LoginPage,
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
  component: ConnectPage,
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
  component: SignupPage,
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
  component: OnboardingPage,
});

const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/otp",
  beforeLoad: async () => {
    if (isDesktopApp()) throw redirect({ to: "/login" });
  },
  component: OtpPage,
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
    component: AcceptWorkspaceInvitationPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/accept-page-invitation",
    component: AcceptPageInvitationPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
    component: SetupPage,
  }),
];
