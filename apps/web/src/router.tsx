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
import ApiKeysSettingsPage from "@/pages/settings/api-keys"
import DashboardPage from "@/pages/dashboard"
import DatabasePage from "@/pages/database"
import IntegrationsSettingsPage from "@/pages/settings/integrations"
import LoginPage from "@/pages/login"
import OnboardingPage from "@/pages/onboarding"
import OtpPage from "@/pages/otp"
import OrganizationSettingsPage from "@/pages/settings/organization"
import ProfileSettingsPage from "@/pages/settings/profile"
import TeamSettingsPage from "@/pages/settings/team"
import SignupPage from "@/pages/signup"
import WorkspacePage from "@/pages/workspace"
import { sessionQueryOptions } from "@notelab/features/auth"
import { organizationsQueryOptions } from "@notelab/features/organizations"
import { ApiError, apiFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { webAuthClient } from "@/providers/features-provider"

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

    const organizations = await getOrganizations()

    throw redirect({ to: organizations.length > 0 ? "/dashboard" : "/onboarding" })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const session = await getFreshSession()

    if (session.user) {
      const organizations = await getOrganizations()

      throw redirect({ to: organizations.length > 0 ? "/dashboard" : "/onboarding" })
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
      const organizations = await getOrganizations()

      throw redirect({ to: organizations.length > 0 ? "/dashboard" : "/onboarding" })
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

    const organizations = await getOrganizations()

    if (organizations.length > 0) {
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

    const organizations = await getOrganizations()

    if (organizations.length === 0) {
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

const aiRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/ai",
  component: AiPage,
})

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace/$workspaceId",
  beforeLoad: async ({ params }) => {
    const session = await getFreshSession()

    if (session.user) {
      const organizations = await getOrganizations()

      if (organizations.length === 0) {
        throw redirect({ to: "/onboarding" })
      }

      return
    }

    if (!(await isWorkspacePublished(params.workspaceId))) {
      throw redirect({ to: "/login" })
    }
  },
  component: WorkspacePage,
})

const databaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/database/$databaseId",
  beforeLoad: async ({ params }) => {
    const session = await getFreshSession()

    if (session.user) {
      const organizations = await getOrganizations()

      if (organizations.length === 0) {
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

const organizationSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/organization",
  component: OrganizationSettingsPage,
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

const teamSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/team",
  component: TeamSettingsPage,
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
    dashboardRoute,
    settingsRoute,
    profileSettingsRoute,
    organizationSettingsRoute,
    integrationsSettingsRoute,
    apiKeysSettingsRoute,
    teamSettingsRoute,
  ]),
  workspaceRoute,
  databaseRoute,
])

export const router = createRouter({ routeTree })

function getFreshSession() {
  return queryClient.fetchQuery({
    ...sessionQueryOptions(webAuthClient),
    staleTime: 0,
  })
}

function getOrganizations() {
  return queryClient.fetchQuery({
    ...organizationsQueryOptions(webAuthClient),
    staleTime: 0,
  })
}

async function isWorkspacePublished(workspaceId: string) {
  try {
    const result = await apiFetch<{ published: boolean }>(
      `/workspaces/${workspaceId}/published`,
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
