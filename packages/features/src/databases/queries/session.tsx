import type { QueryClient } from "@tanstack/react-query"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type PropsWithChildren,
} from "react"

import type { ApiFetcher } from "../../shared/api-fetcher"
import { guardPendingDatabaseWrites } from "../mutations/beforeunload"

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
  children,
  queryClient,
  sessionId,
}: DbProviderProps) {
  const previousSessionRef = useRef<string | null>(null)

  useEffect(() => {
    const current = sessionId ?? "public"
    const previous = previousSessionRef.current
    if (previous && previous !== current) {
      queryClient.removeQueries({ queryKey: ["db", previous] })
    }
    previousSessionRef.current = current
  }, [queryClient, sessionId])

  useEffect(() => {
    if (typeof window === "undefined") return
    return guardPendingDatabaseWrites(window)
  }, [])

  return (
    <DatabaseSessionContext.Provider value={sessionId ?? "public"}>
      {children}
    </DatabaseSessionContext.Provider>
  )
}
