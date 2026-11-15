import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { editionWebModule } from "@zilobase/edition-web";

import { isDesktopApp } from "@/platform/environment";
import { isFeatureEnabled } from "@/platform/environment";
import {
  applyAppAccess,
  applyStartRedirect,
  applyLoginAccess,
  applySignupAccess,
  applyOnboardingAccess,
  applyOAuthConsentAccess,
  applyDatabaseShareAccess,
  applyPageShareAccess,
  getFreshSession,
} from "./guards";
import { PendingPage, RootRouteShell } from "./route-shell";
import {
  validateCalendarSearch,
  validateAiSearch,
  validateDatabaseSearch,
  validateLibrarySearch,
  validateLoginSearch,
  validatePageSearch,
  validateOAuthConsentSearch,
  validateSignupSearch,
  validateTeamSettingsSearch,
  validateTeamspaceSettingsSearch,
} from "./search-validators";

const rootRoute = createRootRoute({ component: RootRouteShell });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => applyAppAccess(),
  component: Outlet,
  pendingComponent: PendingPage,
});

// Public routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => applyStartRedirect(),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateLoginSearch,
  beforeLoad: ({ search }) => applyLoginAccess(search),
  component: lazyRouteComponent(() => import("@/sections/auth/login-screen")),
});

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connect",
  beforeLoad: () => {
    if (!isDesktopApp()) throw redirect({ to: "/login" });
  },
  component: lazyRouteComponent(() => import("@/sections/desktop/servers/desktop-connect-screen")),
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  validateSearch: validateSignupSearch,
  beforeLoad: ({ search }) => applySignupAccess(search),
  component: lazyRouteComponent(() => import("@/sections/auth/signup-screen")),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: () => applyOnboardingAccess(),
  component: lazyRouteComponent(() => import("@/sections/auth/onboarding-screen")),
});

const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/otp",
  beforeLoad: async () => {
    if (isDesktopApp()) throw redirect({ to: "/login" });
  },
  component: lazyRouteComponent(() => import("@/sections/auth/otp-screen")),
});

const oauthConsentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/consent",
  validateSearch: validateOAuthConsentSearch,
  beforeLoad: ({ search }) => applyOAuthConsentAccess(search),
  component: lazyRouteComponent(() => import("@/sections/oauth/consent-screen")),
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: lazyRouteComponent(() => import("@/sections/oauth/callback-screen")),
});

const publicRoutes = [
  indexRoute,
  connectRoute,
  loginRoute,
  signupRoute,
  onboardingRoute,
  otpRoute,
  oauthConsentRoute,
  oauthCallbackRoute,
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/accept-invitation",
    component: lazyRouteComponent(
      () => import("@/sections/workspaces/invitations/accept-workspace-invitation-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/accept-page-invitation",
    component: lazyRouteComponent(
      () => import("@/sections/pages/access/accept-page-invitation-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
    component: lazyRouteComponent(() => import("@/sections/auth/setup-screen")),
  }),
];

// Application routes
const appRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/calendar",
    validateSearch: validateCalendarSearch,
    component: lazyRouteComponent(() => import("@/sections/calendar/calendar-screen")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/ai",
    validateSearch: validateAiSearch,
    beforeLoad: () => {
      if (!isFeatureEnabled("askAi"))
        throw redirect({ to: "/recents", search: { view: "recents" } });
    },
    component: lazyRouteComponent(() => import("@/sections/ai/ai-screen")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/canvas",
    component: lazyRouteComponent(() => import("@/sections/canvas/canvas-screen")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/recents",
    validateSearch: validateLibrarySearch,
    component: lazyRouteComponent(() => import("@/sections/library/recents-screen")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/tasks",
    beforeLoad: () => {
      if (!isFeatureEnabled("tasks"))
        throw redirect({ to: "/recents", search: { view: "recents" } });
    },
    component: lazyRouteComponent(() => import("@/sections/tasks/tasks-screen")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/trash",
    beforeLoad: () => {
      throw redirect({ search: { view: "trash" }, to: "/recents" });
    },
  }),
];

// Settings routes
const settingsRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings",
    beforeLoad: () => {
      throw redirect({ to: "/settings/preferences" });
    },
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/preferences",
    component: lazyRouteComponent(
      () => import("@/sections/settings/preferences/preferences-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/profile",
    component: lazyRouteComponent(
      () => import("@/sections/settings/profile/profile-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/security",
    component: lazyRouteComponent(
      () => import("@/sections/settings/security/security-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/workspace",
    component: lazyRouteComponent(
      () => import("@/sections/workspaces/settings/workspace-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/api-keys",
    component: lazyRouteComponent(
      () => import("@/sections/settings/api-keys/api-keys-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/connected-apps",
    component: lazyRouteComponent(
      () => import("@/sections/settings/connected-apps/connected-apps-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/oauth-apps",
    component: lazyRouteComponent(
      () => import("@/sections/settings/oauth-apps/oauth-apps-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/team",
    validateSearch: validateTeamSettingsSearch,
    component: lazyRouteComponent(
      () => import("@/sections/workspaces/members/workspace-members-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/calendar",
    component: lazyRouteComponent(
      () => import("@/sections/settings/calendar/calendar-settings-screen"),
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/teamspaces",
    validateSearch: validateTeamspaceSettingsSearch,
    component: lazyRouteComponent(() => import("@/sections/teamspaces/teamspaces-settings-screen")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: `${editionWebModule.routePrefix}/$`,
    component: lazyRouteComponent(() => import("./route-shell"), "EditionRouteHost"),
  }),
];

// Content routes
const contentRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$pageId",
    validateSearch: validatePageSearch,
    beforeLoad: async ({ params }) => ({
      publishedShare: await applyPageShareAccess(params.pageId),
    }),
    component: lazyRouteComponent(() => import("@/sections/pages/page-screen")),
    pendingComponent: PendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/m/$meetingId",
    beforeLoad: async () => ({
      authenticatedMeeting: Boolean((await getFreshSession({ optional: true })).user),
    }),
    component: lazyRouteComponent(() => import("@/sections/meetings/meeting-screen")),
    pendingComponent: PendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/d/$databaseId",
    validateSearch: validateDatabaseSearch,
    beforeLoad: async ({ params }) => ({
      publishedShare: await applyDatabaseShareAccess(params.databaseId),
    }),
    component: lazyRouteComponent(() => import("@/sections/databases/database-screen")),
    pendingComponent: PendingPage,
  }),
];

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
