import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router"

import { AppLayout } from "@/components/app-layout"
import AcceptInvitationPage from "@/pages/accept-invitation"
import AiPage from "@/pages/ai"
import CanvasPage from "@/pages/canvas"
import ApiKeysSettingsPage from "@/pages/settings/api-keys"
import DashboardPage from "@/pages/dashboard"
import DatabasePage from "@/pages/database"
import IntegrationsSettingsPage from "@/pages/settings/integrations"
import LoginPage from "@/pages/login"
import OnboardingPage from "@/pages/onboarding"
import OtpPage from "@/pages/otp"
import ZilobaseAiSettingsPage from "@/pages/settings/zilobase-ai"
import WorkspaceSettingsPage from "@/pages/settings/workspace"
import ProfileSettingsPage from "@/pages/settings/profile"
import TeamSettingsPage from "@/pages/settings/team"
import PlanSettingsPage from "@/pages/settings/plan"
import SignupPage from "@/pages/signup"
import Page from "@/pages/page"
import { sessionQueryOptions } from "@zilobase/features/auth"
import { workspacesQueryOptions } from "@zilobase/features/workspaces"
import { ApiError, apiFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { webAuthClient } from "@/providers/features-provider"

const NAVIGATION_AUTH_STALE_TIME = 30_000

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const session = await getFreshSession()

    if (!session.user) {
      throw redirect({ to: "/login" })
    }

    const workspaces = await getWorkspaces()

    throw redirect({ to: workspaces.length > 0 ? "/dashboard" : "/onboarding" })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const session = await getFreshSession()

    if (session.user) {
      const workspaces = await getWorkspaces()

      throw redirect({ to: workspaces.length > 0 ? "/dashboard" : "/onboarding" })
    }
  },
  component: LoginPage,
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  beforeLoad: async () => {
    const session = await getFreshSession()

    if (session.user) {
      const workspaces = await getWorkspaces()

      throw redirect({ to: workspaces.length > 0 ? "/dashboard" : "/onboarding" })
    }
  },
  component: SignupPage,
})

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: async () => {
    const session = await getFreshSession()

    if (!session.user) {
      throw redirect({ to: "/login" })
    }

    const workspaces = await getWorkspaces()

    if (workspaces.length > 0) {
      throw redirect({ to: "/dashboard" })
    }
  },
  component: OnboardingPage,
})

const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/otp",
  component: OtpPage,
})

const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-invitation",
  component: AcceptInvitationPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    const session = await getFreshSession()

    if (!session.user) {
      throw redirect({ to: "/login" })
    }

    const workspaces = await getWorkspaces()

    if (workspaces.length === 0) {
      throw redirect({ to: "/onboarding" })
    }
  },
  component: AppLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: DashboardPage,
})

const trashRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/trash",
  component: () => <DashboardPage mode="trash" />,
})

const canvasRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/canvas",
  component: CanvasPage,
})

const aiRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/ai",
  validateSearch: (search: Record<string, unknown>) => ({
    thread:
      typeof search.thread === "string" && search.thread.trim()
        ? search.thread.trim()
        : undefined,
  }),
  component: AiPage,
})

const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$pageId",
  beforeLoad: async ({ params }) => {
    const session = await getFreshSession()

    if (session.user) {
      const workspaces = await getWorkspaces()

      if (workspaces.length === 0) {
        throw redirect({ to: "/onboarding" })
      }

      return
    }

    if (!(await isPagePublished(params.pageId))) {
      throw redirect({ to: "/login" })
    }
  },
  component: Page,
})

const databaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/d/$databaseId",
  validateSearch: (search: Record<string, unknown>) => ({
    view:
      typeof search.view === "string" && search.view.trim()
        ? search.view.trim()
        : undefined,
  }),
  beforeLoad: async ({ params }) => {
    const session = await getFreshSession()

    if (session.user) {
      const workspaces = await getWorkspaces()

      if (workspaces.length === 0) {
        throw redirect({ to: "/onboarding" })
      }

      return
    }

    if (!(await isDatabasePublished(params.databaseId))) {
      throw redirect({ to: "/login" })
    }
  },
  component: DatabasePage,
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  beforeLoad: () => {
    throw redirect({ to: "/settings/profile" })
  },
})

const profileSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/profile",
  component: ProfileSettingsPage,
})

const workspaceSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/workspace",
  component: WorkspaceSettingsPage,
})

const integrationsSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/integrations",
  component: IntegrationsSettingsPage,
})

const apiKeysSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/api-keys",
  component: ApiKeysSettingsPage,
})

const zilobaseAiSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/zilobase-ai",
  component: ZilobaseAiSettingsPage,
})

const teamSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/team",
  component: TeamSettingsPage,
})

const planSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/plan",
  component: PlanSettingsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  signupRoute,
  onboardingRoute,
  otpRoute,
  acceptInvitationRoute,
  appRoute.addChildren([
    aiRoute,
    canvasRoute,
    dashboardRoute,
    trashRoute,
    settingsRoute,
    profileSettingsRoute,
    workspaceSettingsRoute,
    integrationsSettingsRoute,
    apiKeysSettingsRoute,
    zilobaseAiSettingsRoute,
    teamSettingsRoute,
    planSettingsRoute,
  ]),
  pageRoute,
  databaseRoute,
])

export const router = createRouter({ routeTree })

function getFreshSession() {
  return queryClient.fetchQuery({
    ...sessionQueryOptions(webAuthClient),
    staleTime: NAVIGATION_AUTH_STALE_TIME,
  })
}

function getWorkspaces() {
  return queryClient.fetchQuery({
    ...workspacesQueryOptions(webAuthClient),
    staleTime: NAVIGATION_AUTH_STALE_TIME,
  })
}

async function isPagePublished(pageId: string) {
  try {
    const result = await apiFetch<{ published: boolean }>(
      `/pages/${pageId}/published`,
      { auth: false, method: "GET" },
    )

    return result.published
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return false
    }

    throw error
  }
}

async function isDatabasePublished(databaseId: string) {
  try {
    const result = await apiFetch<{ published: boolean }>(
      `/databases/${databaseId}/published`,
      { auth: false, method: "GET" },
    )

    return result.published
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return false
    }

    throw error
  }
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
