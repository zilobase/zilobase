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
} from "./database-client"

const DatabaseClientContext = createContext<DatabaseClient | null>(null)

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

  useEffect(() => () => {
    if (client) void client.cleanup()
  }, [client])

  if (!client) {
    return (
      <DatabaseClientContext.Provider value={null}>
        {children}
      </DatabaseClientContext.Provider>
    )
  }

  return (
    <DatabaseClientContext.Provider value={client}>
      <TanStackDbProvider client={client.tanstack}>
        {children}
      </TanStackDbProvider>
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
    propertyId: target.propertyId,
    rowId: target.rowId,
  }), [target.dataSourceId, target.propertyId, target.rowId])
  return useSyncExternalStore(
    (listener) => client.subscribeCommandState(stableTarget, listener),
    () => client.commandState(stableTarget),
    () => client.commandState(stableTarget),
  )
}
