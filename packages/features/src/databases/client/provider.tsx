import type { QueryClient } from "@tanstack/react-query"
import { DbProvider as TanStackDbProvider } from "@tanstack/react-db"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react"

import type { ApiFetcher } from "../../shared/api-fetcher"
import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseCommandTarget,
} from "./db-client"
import { retainDatabaseClient } from "./client-lifecycle"
import { guardPendingDatabaseWrites } from "./commands/pending-navigation"

const DatabaseClientContext = createContext<DatabaseClient | null>(null)

const DatabaseSessionContext = createContext<string | null>(null)

export function useDatabaseSessionId(): string {
  return useContext(DatabaseSessionContext) ?? "public"
}

export type DbProviderProps = PropsWithChildren<{
  apiFetch: ApiFetcher
  queryClient: QueryClient
  sessionId: string | null
}>

export function DbProvider({
  apiFetch,
  children,
  queryClient,
  sessionId,
}: DbProviderProps) {
  const client = useMemo(
    () => sessionId
      ? createDatabaseClient({ apiFetch, queryClient, sessionId })
      : null,
    [apiFetch, queryClient, sessionId],
  )

  useEffect(
    () => client ? retainDatabaseClient(client) : undefined,
    [client],
  )

  useEffect(() => {
    if (client && typeof window !== "undefined") {
      return guardPendingDatabaseWrites(client, window)
    }
  }, [client])

  if (!client) {
    return (
      <DatabaseClientContext.Provider value={null}>
        <DatabaseSessionContext.Provider value={sessionId ?? "public"}>
          {children}
        </DatabaseSessionContext.Provider>
      </DatabaseClientContext.Provider>
    )
  }

  return (
    <DatabaseClientContext.Provider value={client}>
      <DatabaseSessionContext.Provider value={sessionId ?? "public"}>
        <TanStackDbProvider client={client.tanstack}>
          {children}
        </TanStackDbProvider>
      </DatabaseSessionContext.Provider>
    </DatabaseClientContext.Provider>
  )
}

export function useDatabaseClient() {
  const client = useContext(DatabaseClientContext)
  if (!client) {
    throw new Error("useDatabaseClient must be used in an authenticated DbProvider")
  }
  return client
}

export function useOptionalDatabaseClient() {
  return useContext(DatabaseClientContext)
}

export function useDatabaseEntityCommandState(target: DatabaseCommandTarget) {
  const client = useDatabaseClient()
  const stableTarget = useMemo(() => ({
    dataSourceId: target.dataSourceId,
    hostDatabaseId: target.hostDatabaseId,
    propertyId: target.propertyId,
    rowId: target.rowId,
    viewId: target.viewId,
  }), [
    target.dataSourceId,
    target.hostDatabaseId,
    target.propertyId,
    target.rowId,
    target.viewId,
  ])
  return useSyncExternalStore(
    (listener) => client.subscribeCommandState(stableTarget, listener),
    () => client.commandState(stableTarget),
    () => client.commandState(stableTarget),
  )
}
