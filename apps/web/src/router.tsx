import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type ErrorComponentProps,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

import { AppLayout } from "@/components/app-layout"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import AcceptInvitationPage from "@/pages/accept-invitation"
import AcceptPageInvitationPage from "@/pages/accept-page-invitation"
import AiPage from "@/pages/ai"
import CanvasPage from "@/pages/canvas"
import ApiKeysSettingsPage from "@/pages/settings/api-keys"
import RecentsPage from "@/pages/recents"
import { libraryViewIds } from "@zilobase/features/user-settings"
import { pageQueryOptions, pagesQueryOptions } from "@zilobase/features/pages"
import DatabasePage from "@/pages/database"
import MeetingPage from "@/pages/meeting"
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
import TeamspacesSettingsPage from "@/pages/settings/teamspaces"
import { normalizeTeamSettingsTab } from "@/pages/settings/team-settings-tabs"
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
import {
  getSelectedDesktopServer,
  listDesktopServerProfiles,
  type DesktopServerProfile,
} from "@/lib/desktop-server"
import { executeDesktopServerSwitch } from "@/lib/desktop-server-switch"
import { getAuthReturnPath } from "@/lib/google-auth"
import { decidePublishedShareAccess } from "@/lib/published-share-access"
import { describeRouteError } from "@/lib/route-error"
import { editionWebModule } from "@zilobase/edition-web"
import { DocumentFavicon } from "@/components/document-favicon"

const NAVIGATION_AUTH_STALE_TIME = 30_000

const rootRoute = createRootRoute({
  component: RootRouteShell,
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

const acceptPageInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-page-invitation",
  component: AcceptPageInvitationPage,
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
  component: Outlet,
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
  validateSearch: (
    search: Record<string, unknown>,
  ): { meeting?: string } =>
    typeof search.meeting === "string" && search.meeting.trim()
      ? { meeting: search.meeting.trim() }
      : {},
  beforeLoad: async ({ params }) => ({
    publishedShare: await applyPageShareAccess(params.pageId),
  }),
  component: Page,
  pendingComponent: AppContentPendingPage,
})

const meetingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/m/$meetingId",
  component: MeetingPage,
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
  beforeLoad: async ({ params }) => ({
    publishedShare: await applyPublishedShareAccess(() =>
      isDatabasePublished(params.databaseId),
    ),
  }),
  component: DatabasePage,
  pendingComponent: AppContentPendingPage,
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
  validateSearch: (search: Record<string, unknown>) => ({
    tab: normalizeTeamSettingsTab(search.tab),
  }),
  component: TeamSettingsPage,
})

const teamspacesSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/teamspaces",
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search.tab === "general" ||
      search.tab === "members" ||
      search.tab === "permissions" ||
      search.tab === "security"
        ? search.tab
        : undefined,
    teamspace:
      typeof search.teamspace === "string" && search.teamspace.trim()
        ? search.teamspace
        : undefined,
  }),
  component: TeamspacesSettingsPage,
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
  acceptPageInvitationRoute,
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
    teamspacesSettingsRoute,
    editionRoute,
  ]),
  pageRoute,
  databaseRoute,
  meetingRoute,
])

export const router = createRouter({
  routeTree,
  defaultErrorComponent: RouteErrorPage,
  defaultPendingComponent: RoutePendingPage,
  defaultPendingMinMs: 300,
  defaultPendingMs: 250,
  defaultPreload: "intent",
})

function RootRouteShell() {
  const matches = useRouterState({ select: (state) => state.matches })
  const shellVisibleForResolvedRoute = matches.some((match) => {
    if (match.routeId === "/app") return true
    if (match.routeId !== "/p/$pageId" && match.routeId !== "/d/$databaseId") {
      return false
    }

    const context = match.context as { publishedShare?: string }
    return context.publishedShare === "app"
  })
  const routePending = matches.some((match) => match.status === "pending")
  const resolvedShellVisibleRef = useRef(false)

  if (!routePending) {
    resolvedShellVisibleRef.current = shellVisibleForResolvedRoute
  }

  const showAppShell = routePending
    ? resolvedShellVisibleRef.current
    : shellVisibleForResolvedRoute

  return (
    <>
      <DocumentFavicon />
      {showAppShell ? (
        <AppLayout>
          <Outlet />
        </AppLayout>
      ) : (
        <Outlet />
      )}
    </>
  )
}

function AppContentPendingPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <Spinner className="size-5" />
    </main>
  )
}

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
  const copy = describeRouteError(error, {
    isDesktop: isTauri() || Boolean(selectedServer),
    selectedServer,
  })
  const [otherProfiles, setOtherProfiles] = useState<DesktopServerProfile[]>([])

  useEffect(() => {
    recordDesktopDiagnostic(
      "router.error",
      describeDesktopError(error),
      "error",
    )
  }, [error])

  useEffect(() => {
    if (!copy.showChangeServer) return
    let disposed = false
    void listDesktopServerProfiles()
      .then((result) => {
        if (!disposed) {
          setOtherProfiles(result.profiles.filter((profile) => !profile.active))
        }
      })
      .catch(() => {
        if (!disposed) setOtherProfiles([])
      })
    return () => {
      disposed = true
    }
  }, [copy.showChangeServer])

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div>
          <h1 className="text-lg font-semibold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          {otherProfiles.map((profile) => (
            <Button
              key={`${profile.server.instanceId}:${profile.server.apiOrigin}`}
              onClick={() => {
                void executeDesktopServerSwitch({
                  hasCredentials: profile.hasCredentials,
                  path: profile.hasCredentials
                    ? (profile.lastPath ?? "/recents")
                    : "/login",
                  server: profile.server,
                  workspaceId: profile.lastActiveWorkspaceId,
                })
              }}
              variant="outline"
            >
              Switch to {profile.server.displayName}
            </Button>
          ))}
          {copy.showChangeServer ? (
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

async function applyPublishedShareAccess(isPublished: () => Promise<boolean>) {
  const decision = await decidePublishedShareAccess({
    getSession: () => getFreshSession({ optional: true }),
    getWorkspaces,
    isPublished,
  })

  if (decision.type === "login") {
    throw redirect({ to: "/login" })
  }

  if (decision.type === "onboarding") {
    throw redirect({ to: "/onboarding" })
  }

  return decision.type
}

async function applyPageShareAccess(pageId: string) {
  const session = await getFreshSession({ optional: true })

  if (!session.user) {
    return applyPublishedShareAccess(() => isPagePublished(pageId))
  }

  try {
    const detail = await queryClient.fetchQuery({
      ...pageQueryOptions(apiFetch, pageId),
    })

    if (detail?.viewerType === "guest") return "guest" as const
    if (detail?.viewerType === "public") return "public" as const
    if (detail?.viewerType === "member") return "app" as const
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ActiveWorkspaceMismatchError"
    ) {
      return "app" as const
    }
    throw error
  }

  const workspaces = await getWorkspaces()
  if (workspaces.length === 0) throw redirect({ to: "/onboarding" })
  return "app" as const
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
