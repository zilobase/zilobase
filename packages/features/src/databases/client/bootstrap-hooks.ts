import { useLiveQuery } from "@tanstack/react-db"

import type { DatabaseBootstrapResponse } from "../contracts-v2"
import type {
  DatabaseBootstrapState,
  DatabaseScope,
} from "./database-client"
import { SessionDatabaseClient } from "./database-client"
import { useOptionalDatabaseClient } from "./provider"

export type DatabaseBootstrapHookState = Omit<
  DatabaseBootstrapState,
  "scope"
> & {
  scope: DatabaseScope | null
}

export function useDatabaseBootstrap(
  scope: DatabaseScope | null,
): DatabaseBootstrapHookState {
  const facade = useOptionalDatabaseClient()
  const collections = scope && facade instanceof SessionDatabaseClient
    ? facade.getBootstrapCollections(scope)
    : null
  const databases = useLiveQuery(
    () => collections?.database,
    [collections?.database],
  )
  const dataSources = useLiveQuery(
    () => collections?.dataSources,
    [collections?.dataSources],
  )
  const properties = useLiveQuery(
    () => collections?.properties,
    [collections?.properties],
  )
  const views = useLiveQuery(
    () => collections?.views,
    [collections?.views],
  )

  if (!scope || !collections || !(facade instanceof SessionDatabaseClient)) {
    return { data: undefined, error: null, scope: null, status: "idle" }
  }

  const state = facade.bootstrap(scope)
  const database = databases.data?.[0]
  const data = database &&
      dataSources.isReady &&
      properties.isReady &&
      views.isReady
    ? {
        database,
        dataSources: dataSources.data ?? [],
        properties: properties.data ?? [],
        views: views.data ?? [],
      } satisfies DatabaseBootstrapResponse
    : state.data

  return { ...state, data, scope }
}
