import { createRoute, redirect } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";

import AcceptInvitationPage from "@/pages/accept-invitation";
import AcceptPageInvitationPage from "@/pages/accept-page-invitation";
import ConnectPage from "@/pages/connect";
import LoginPage from "@/pages/login";
import OnboardingPage from "@/pages/onboarding";
import OtpPage from "@/pages/otp";
import SetupPage from "@/pages/setup";
import SignupPage from "@/pages/signup";
import { getAuthReturnPath } from "@/lib/google-auth";
import { getConnectivityState } from "@/lib/offline-store";
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
    if (!isTauri()) throw redirect({ to: "/login" });

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
    if (isTauri()) throw redirect({ to: "/login" });
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
    component: AcceptInvitationPage,
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
