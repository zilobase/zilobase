import * as React from "react"
import {
  onlineManager,
  QueryClientProvider,
  useIsRestoring,
  type QueryClient,
} from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { toast } from "sonner"

import { toApiUrl } from "@/lib/api"
import { connectivityStateDuringProbe } from "@/lib/connectivity-probe"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import { setDesktopAuthOwner } from "@/lib/desktop-auth-token"
import { syncDirtyOfflinePages } from "@/lib/offline-recovery"
import {
  getConnectivityState,
  getOfflineManifest,
  getValidOfflineSession,
  initializeOfflineStore,
  isDesktopOfflineSupported,
  OFFLINE_CACHE_BUSTER,
  OFFLINE_CACHE_MAX_AGE,
  offlineQueryPersister,
  rememberValidatedOfflineSession,
  setConnectivityState,
  shouldPersistOfflineQuery,
  subscribeConnectivity,
  subscribeOfflineManifest,
  type ConnectivityState,
} from "@/lib/offline-store"

export function OfflineQueryProvider({
  children,
  client,
}: React.PropsWithChildren<{ client: QueryClient }>) {
  const desktop = isDesktopOfflineSupported()
  const [ready, setReady] = React.useState(!desktop)

  React.useEffect(() => {
    if (!desktop) return

    const startedAt = performance.now()
    recordDesktopDiagnostic("offline_store.initialization", { status: "started" })
    void initializeOfflineStore().then(
      () => {
        const snapshot = getValidOfflineSession()
        if (snapshot) {
          client.setQueryData(["session"], {
            session: snapshot.session,
            user: snapshot.user,
            workspacePinned: snapshot.workspacePinned,
          })
          client.setQueryData(["workspaces"], getOfflineManifest().workspaces)
        }
        recordDesktopDiagnostic("offline_store.initialization", {
          duration_ms: performance.now() - startedAt,
          session_present: Boolean(snapshot),
          status: "success",
        })
        setReady(true)
      },
      (error) => {
        recordDesktopDiagnostic(
          "offline_store.initialization",
          {
            ...describeDesktopError(error),
            duration_ms: performance.now() - startedAt,
          },
          "error",
        )
        throw error
      },
    )
  }, [client, desktop])

  React.useEffect(() => {
    if (!desktop || !ready) return
    let sessionValidatedAt = 0
    let workspacesValidatedAt = 0
    return client.getQueryCache().subscribe((event) => {
      if (
        getConnectivityState() !== "online" ||
        event.type !== "updated" ||
        event.query.state.status !== "success"
      ) return
      const root = event.query.queryKey[0]
      if (root === "session") sessionValidatedAt = Date.now()
      if (root === "workspaces") workspacesValidatedAt = Date.now()
      if (
        !sessionValidatedAt ||
        !workspacesValidatedAt ||
        Math.abs(sessionValidatedAt - workspacesValidatedAt) > 60_000
      ) return
      const session = client.getQueryData<{
        session: NonNullable<ReturnType<typeof getValidOfflineSession>>["session"] | null
        user: NonNullable<ReturnType<typeof getValidOfflineSession>>["user"] | null
        workspacePinned?: boolean
      }>(["session"])
      const workspaces = client.getQueryData<Array<{
        id: string
        name: string
        slug: string
      }>>(["workspaces"])

      if (!session?.session || !session.user || !workspaces) return
      void setDesktopAuthOwner(session.user.id)
      void rememberValidatedOfflineSession(
        {
          session: session.session,
          user: session.user,
          validatedAt: new Date().toISOString(),
          workspacePinned: session.workspacePinned,
        },
        workspaces,
      )
      sessionValidatedAt = 0
      workspacesValidatedAt = 0
    })
  }, [client, desktop, ready])

  if (!ready) return null
  if (!desktop) {
    return (
      <QueryClientProvider client={client}>
        <OfflineRuntime />
        {children}
      </QueryClientProvider>
    )
  }

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        buster: OFFLINE_CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: shouldPersistOfflineQuery,
        },
        maxAge: OFFLINE_CACHE_MAX_AGE,
        persister: offlineQueryPersister,
      }}
    >
      <OfflineRuntime />
      <OfflineSyncCoordinator />
      <RestoreGate>{children}</RestoreGate>
    </PersistQueryClientProvider>
  )
}

function OfflineSyncCoordinator() {
  const manifest = useOfflineManifest()
  const connectivity = useConnectivity()
  const running = React.useRef(false)
  const manifestRef = React.useRef(manifest)
  const previousConnectivity = React.useRef<ConnectivityState | null>(null)

  manifestRef.current = manifest

  React.useEffect(() => {
    const cameOnline =
      connectivity === "online" && previousConnectivity.current !== "online"
    previousConnectivity.current = connectivity

    if (
      !cameOnline ||
      running.current ||
      !manifestRef.current.items.some(
        (item) => item.kind === "page" && (item.dirty || item.blocked),
      )
    ) return
    running.current = true
    void syncDirtyOfflinePages().finally(() => {
      running.current = false
    })
  }, [connectivity])
  return null
}

function RestoreGate({ children }: React.PropsWithChildren) {
  const restoring = useIsRestoring()
  const restoreStartedAt = React.useRef(performance.now())
  const completed = React.useRef(false)

  React.useEffect(() => {
    if (restoring || completed.current) return
    completed.current = true
    recordDesktopDiagnostic("offline_cache.restore", {
      duration_ms: performance.now() - restoreStartedAt.current,
      status: "success",
    })
  }, [restoring])

  return restoring ? null : children
}

function OfflineRuntime() {
  React.useEffect(() => {
    let disposed = false
    let retryTimer: number | null = null
    let probePromise: Promise<void> | null = null
    let attempt = 0

    const scheduleRetry = () => {
      if (disposed || retryTimer !== null) return
      const delay = Math.min(30_000, 1_000 * 2 ** attempt++)
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void probe()
      }, delay)
    }

    const runProbe = async () => {
      if (navigator.onLine === false) {
        setConnectivityState("offline")
        scheduleRetry()
        return
      }

      setConnectivityState(
        connectivityStateDuringProbe(getConnectivityState()),
      )
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 5_000)

      try {
        const response = await fetch(toApiUrl("/health"), {
          cache: "no-store",
          signal: controller.signal,
        })
        if (response.ok) {
          attempt = 0
          if (retryTimer !== null) {
            window.clearTimeout(retryTimer)
            retryTimer = null
          }
          setConnectivityState("online")
          return
        }
        setConnectivityState("service-unavailable")
      } catch {
        setConnectivityState(!navigator.onLine ? "offline" : "service-unavailable")
      } finally {
        window.clearTimeout(timeout)
      }

      scheduleRetry()
    }

    const probe = () => {
      if (probePromise) return probePromise
      probePromise = runProbe().finally(() => {
        probePromise = null
      })
      return probePromise
    }

    const handleOffline = () => {
      setConnectivityState("offline")
      scheduleRetry()
    }
    const handleOnline = () => void probe()
    const handleFocus = () => void probe()
    const handleAuthenticationRequired = () => {
      toast.error("Your session expired. Reconnect and sign in to resume syncing.")
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("zilobase:authentication-required", handleAuthenticationRequired)
    void probe()

    return () => {
      disposed = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("zilobase:authentication-required", handleAuthenticationRequired)
    }
  }, [])

  React.useEffect(() => {
    const updateOnlineManager = () => {
      onlineManager.setOnline(getConnectivityState() === "online")
    }
    updateOnlineManager()
    return subscribeConnectivity(updateOnlineManager)
  }, [])

  return null
}

export function useOfflineManifest() {
  return React.useSyncExternalStore(
    subscribeOfflineManifest,
    getOfflineManifest,
    getOfflineManifest,
  )
}

export function useConnectivity(): ConnectivityState {
  return React.useSyncExternalStore(
    subscribeConnectivity,
    getConnectivityState,
    getConnectivityState,
  )
}

export function useOfflineSessionLocked() {
  const manifest = useOfflineManifest()
  const connectivity = useConnectivity()
  const [now, setNow] = React.useState(Date.now())
  const expiresAt = manifest.session
    ? new Date(manifest.session.session.expiresAt).getTime()
    : 0

  React.useEffect(() => {
    if (!expiresAt || expiresAt <= Date.now()) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(2_147_000_000, expiresAt - Date.now() + 25),
    )
    return () => window.clearTimeout(timer)
  }, [expiresAt])

  return connectivity !== "online" && Boolean(expiresAt) && expiresAt <= now
}
