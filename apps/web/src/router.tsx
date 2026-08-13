import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { AppLayout } from "@/components/app-layout"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import AcceptInvitationPage from "@/pages/accept-invitation"
import AiPage from "@/pages/ai"
import CanvasPage from "@/pages/canvas"
import ApiKeysSettingsPage from "@/pages/settings/api-keys"
import DashboardPage from "@/pages/dashboard"
import { libraryViewIds } from "@zilobase/features/user-settings"
import DatabasePage from "@/pages/database"
import DesktopAuthPage from "@/pages/desktop-auth"
import IntegrationsSettingsPage from "@/pages/settings/integrations"
import PreferencesSettingsPage from "@/pages/settings/preferences"
import LoginPage from "@/pages/login"
import OnboardingPage from "@/pages/onboarding"
import OtpPage from "@/pages/otp"
import ZilobaseAiSettingsPage from "@/pages/settings/zilobase-ai"
import WorkspaceSettingsPage from "@/pages/settings/workspace"
import ProfileSettingsPage from "@/pages/settings/profile"
import TeamSettingsPage from "@/pages/settings/team"
import SignupPage from "@/pages/signup"
import Page from "@/pages/page"
import { sessionQueryOptions } from "@zilobase/features/auth"
import { workspacesQueryOptions } from "@zilobase/features/workspaces"
import { ApiError, NetworkUnavailableError, apiFetch } from "@/lib/api"
import {
  getOfflineManifest,
  getValidOfflineSession,
  isDesktopOfflineSupported,
  isOfflineMode,
} from "@/lib/offline-store"
import { queryClient } from "@/lib/query-client"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
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

const desktopAuthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop-auth",
  component: DesktopAuthPage,
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
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: (typeof libraryViewIds)[number] } =>
    typeof search.view === "string" &&
    libraryViewIds.includes(search.view as (typeof libraryViewIds)[number])
      ? { view: search.view as (typeof libraryViewIds)[number] }
      : {},
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
    throw redirect({ to: "/settings/preferences" })
  },
})

const preferencesSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/preferences",
  component: PreferencesSettingsPage,
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  signupRoute,
  onboardingRoute,
  otpRoute,
  desktopAuthRoute,
  acceptInvitationRoute,
  appRoute.addChildren([
    aiRoute,
    canvasRoute,
    dashboardRoute,
    trashRoute,
    settingsRoute,
    preferencesSettingsRoute,
    profileSettingsRoute,
    workspaceSettingsRoute,
    integrationsSettingsRoute,
    apiKeysSettingsRoute,
    zilobaseAiSettingsRoute,
    teamSettingsRoute,
  ]),
  pageRoute,
  databaseRoute,
])

export const router = createRouter({
  routeTree,
  defaultErrorComponent: RouteErrorPage,
  defaultPendingComponent: RoutePendingPage,
  defaultPendingMinMs: 300,
  defaultPendingMs: 250,
})

function RoutePendingPage() {
  useEffect(() => {
    recordDesktopDiagnostic("router.pending", { status: "started" })
  }, [])

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5" />
        <p className="text-sm text-muted-foreground">Connecting to Zilobase...</p>
      </div>
    </main>
  )
}

function RouteErrorPage({ error }: ErrorComponentProps) {
  useEffect(() => {
    recordDesktopDiagnostic(
      "router.error",
      describeDesktopError(error),
      "error",
    )
  }, [error])

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div>
          <h1 className="text-lg font-semibold">Couldn&apos;t connect to Zilobase</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your desktop session is still saved. Check your connection and try again.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    </main>
  )
}

async function getFreshSession() {
  const cached = getValidOfflineSession()
  if (isDesktopOfflineSupported() && isOfflineMode()) {
    return cached
      ? { session: cached.session, user: cached.user, workspacePinned: cached.workspacePinned }
      : { session: null, user: null }
  }
  try {
    return await queryClient.fetchQuery({
      ...sessionQueryOptions(webAuthClient),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    })
  } catch (error) {
    if (error instanceof NetworkUnavailableError && cached) {
      return { session: cached.session, user: cached.user, workspacePinned: cached.workspacePinned }
    }
    throw error
  }
}

async function getWorkspaces() {
  const cached = getOfflineManifest().workspaces
  if (isDesktopOfflineSupported() && isOfflineMode()) {
    return cached
  }
  try {
    return await queryClient.fetchQuery({
      ...workspacesQueryOptions(webAuthClient),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    })
  } catch (error) {
    if (error instanceof NetworkUnavailableError && getValidOfflineSession()) return cached
    throw error
  }
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
