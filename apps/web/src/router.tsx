import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type ErrorComponentProps,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { AppLayout } from "@/components/app-layout"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import AcceptInvitationPage from "@/pages/accept-invitation"
import AiPage from "@/pages/ai"
import CanvasPage from "@/pages/canvas"
import ApiKeysSettingsPage from "@/pages/settings/api-keys"
import RecentsPage from "@/pages/recents"
import { libraryViewIds } from "@zilobase/features/user-settings"
import { pagesQueryOptions } from "@zilobase/features/pages"
import DatabasePage from "@/pages/database"
import IntegrationsSettingsPage from "@/pages/settings/integrations"
import PreferencesSettingsPage from "@/pages/settings/preferences"
import ConnectPage from "@/pages/connect"
import LoginPage from "@/pages/login"
import OnboardingPage from "@/pages/onboarding"
import OtpPage from "@/pages/otp"
import ZilobaseAiSettingsPage from "@/pages/settings/zilobase-ai"
import WorkspaceSettingsPage from "@/pages/settings/workspace"
import ProfileSettingsPage from "@/pages/settings/profile"
import TeamSettingsPage from "@/pages/settings/team"
import SignupPage from "@/pages/signup"
import SetupPage from "@/pages/setup"
import Page from "@/pages/page"
import { sessionQueryOptions } from "@zilobase/features/auth"
import { workspacesQueryOptions } from "@zilobase/features/workspaces"
import { ApiError, NetworkUnavailableError, apiFetch } from "@/lib/api"
import {
  resolveOfflineFallback,
  waitForSettledConnectivity,
} from "@/lib/connectivity-probe"
import {
  getConnectivityState,
  getOfflineManifest,
  getValidOfflineSession,
  subscribeConnectivity,
} from "@/lib/offline-store"
import { queryClient } from "@/lib/query-client"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import { webAuthClient } from "@/providers/features-provider"
import { getMostRecentItemPath } from "@/lib/recent-navigation"
import { useAppStore } from "@/stores/app-store"
import { isTauri } from "@tauri-apps/api/core"
import { getSelectedDesktopServer } from "@/lib/desktop-server"
import { getAuthReturnPath } from "@/lib/google-auth"
import { editionWebModule } from "@zilobase/edition-web"

const NAVIGATION_AUTH_STALE_TIME = 30_000

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const session = await getFreshSession({ optional: true })

    if (!session.user) {
      throw redirect({ to: "/login" })
    }

    const workspaces = await getWorkspaces()

    if (workspaces.length === 0) {
      throw redirect({ to: "/onboarding" })
    }

    throw redirect({ href: await getDefaultAppPath(session, workspaces) })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {},
  beforeLoad: async ({ search }) => {
    const session = await getFreshSession({ optional: true })

    if (session.user) {
      if (search.returnTo) {
        throw redirect({
          href: getAuthReturnPath(
            "/recents",
            new URLSearchParams({ returnTo: search.returnTo }).toString(),
          ),
        })
      }

      const workspaces = await getWorkspaces()

      throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" })
    }
  },
  component: LoginPage,
})

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connect",
  beforeLoad: async () => {
    if (!isTauri()) {
      throw redirect({ to: "/login" })
    }

    const session = await getFreshSession({ optional: true })

    if (!session.user || getConnectivityState() !== "online") return

    const workspaces = await getWorkspaces()
    throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" })
  },
  component: ConnectPage,
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  validateSearch: (
    search: Record<string, unknown>,
  ): { invitation?: string; returnTo?: string } => ({
    ...(typeof search.invitation === "string"
      ? { invitation: search.invitation }
      : {}),
    ...(typeof search.returnTo === "string"
      ? { returnTo: search.returnTo }
      : {}),
  }),
  beforeLoad: async ({ search }) => {
    const session = await getFreshSession({ optional: true })

    if (session.user) {
      if (search.returnTo) {
        throw redirect({
          href: getAuthReturnPath(
            "/recents",
            `?returnTo=${encodeURIComponent(search.returnTo)}`,
          ),
        })
      }

      const workspaces = await getWorkspaces()

      throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" })
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
      throw redirect({ to: "/recents" })
    }
  },
  component: OnboardingPage,
})

const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/otp",
  beforeLoad: async () => {
    if (isTauri()) {
      throw redirect({ to: "/login" })
    }
  },
  component: OtpPage,
})

const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-invitation",
  component: AcceptInvitationPage,
})

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupPage,
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

const recentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/recents",
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: (typeof libraryViewIds)[number] } =>
    typeof search.view === "string" &&
    libraryViewIds.includes(search.view as (typeof libraryViewIds)[number])
      ? { view: search.view as (typeof libraryViewIds)[number] }
      : {},
  component: RecentsPage,
})

const trashRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/trash",
  component: () => <RecentsPage mode="trash" />,
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

const editionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/enterprise/$",
  component: EditionRouteHost,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  connectRoute,
  loginRoute,
  signupRoute,
  onboardingRoute,
  otpRoute,
  acceptInvitationRoute,
  setupRoute,
  appRoute.addChildren([
    aiRoute,
    canvasRoute,
    recentsRoute,
    trashRoute,
    settingsRoute,
    preferencesSettingsRoute,
    profileSettingsRoute,
    workspaceSettingsRoute,
    integrationsSettingsRoute,
    apiKeysSettingsRoute,
    zilobaseAiSettingsRoute,
    teamSettingsRoute,
    editionRoute,
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

function EditionRouteHost() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const route = editionWebModule.routes.find(
    (candidate) =>
      `/enterprise/${candidate.path.replace(/^\/+/, "")}` === pathname,
  )

  if (!route) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Enterprise page not found.</p>
      </main>
    )
  }

  const EditionComponent = route.component
  return <EditionComponent />
}

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
  const selectedServer = getSelectedDesktopServer()

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
            Your desktop session is still saved. Check your connection
            {selectedServer ? ", or connect to a different server" : " and try again"}
            .
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          {selectedServer ? (
            <Button
              onClick={() => window.location.assign("/connect")}
              variant="outline"
            >
              Change server
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function getStartupConnectivity() {
  return waitForSettledConnectivity({
    getState: getConnectivityState,
    subscribe: subscribeConnectivity,
  })
}

async function getFreshSession(options?: { optional?: boolean }) {
  const connectivity = await getStartupConnectivity()
  const cached = getValidOfflineSession()
  const decision = resolveOfflineFallback(connectivity, cached)
  if (decision.type === "fallback") {
    return {
      session: decision.value.session,
      user: decision.value.user,
      workspacePinned: decision.value.workspacePinned,
    }
  }
  if (decision.type === "unavailable") {
    if (options?.optional) return { session: null, user: null }
    throw new NetworkUnavailableError()
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
    if (options?.optional && error instanceof NetworkUnavailableError) {
      return { session: null, user: null }
    }
    throw error
  }
}

async function getWorkspaces() {
  const connectivity = await getStartupConnectivity()
  const cached = getOfflineManifest().workspaces
  const decision = resolveOfflineFallback(
    connectivity,
    getValidOfflineSession() ? cached : null,
  )
  if (decision.type === "fallback") return decision.value
  if (decision.type === "unavailable") {
    throw new NetworkUnavailableError()
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

async function getDefaultAppPath(
  session: Awaited<ReturnType<typeof getFreshSession>>,
  workspaces: Awaited<ReturnType<typeof getWorkspaces>>,
) {
  const preferredWorkspaceId = useAppStore.getState().activeWorkspaceId
  const sessionWorkspaceId = session.session?.activeWorkspaceId ?? null
  const workspaceId =
    workspaces.find((workspace) => workspace.id === preferredWorkspaceId)?.id ??
    workspaces.find((workspace) => workspace.id === sessionWorkspaceId)?.id ??
    workspaces[0]?.id

  if (!workspaceId) return "/recents"

  const options = pagesQueryOptions(apiFetch, workspaceId)

  try {
    const navigation =
      getConnectivityState() !== "online"
        ? queryClient.getQueryData(options.queryKey)
        : await queryClient.fetchQuery({
            ...options,
            staleTime: NAVIGATION_AUTH_STALE_TIME,
          })

    return navigation
      ? getMostRecentItemPath(navigation) ?? "/recents"
      : "/recents"
  } catch {
    return "/recents"
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
