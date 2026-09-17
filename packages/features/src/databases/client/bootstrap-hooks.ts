import { useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"

import type { DatabaseBootstrapResponse } from  "../core/entities"
import { useZilobaseFeatures } from "../../shared/context"
import type {
  DatabaseBootstrapState,
  DatabaseScope,
} from "./db-client"
import { SessionDatabaseClient } from "./db-client"
import { useOptionalDatabaseClient } from "./provider"
import { databaseBootstrapQueryOptions } from "./bootstrap-collections"

export type DatabaseBootstrapHookState = Omit<
  DatabaseBootstrapState,
  "scope"
> & {
  refetch: () => Promise<unknown>
  scope: DatabaseScope | null
}

export function useDatabaseBootstrap(
  scope: DatabaseScope | null,
): DatabaseBootstrapHookState {
  const facade = useOptionalDatabaseClient()
  const { apiFetch } = useZilobaseFeatures()
  const publicBootstrap = useQuery({
    ...databaseBootstrapQueryOptions(
      apiFetch,
      "public",
      scope ?? { databaseId: "disabled" },
    ),
    enabled: Boolean(scope) && !(facade instanceof SessionDatabaseClient),
  })
  const collections = scope && facade instanceof SessionDatabaseClient
    ? facade.getBootstrapCollections(scope)
    : null
  const databases = useLiveQuery(() => collections?.database)
  const dataSources = useLiveQuery(() => collections?.dataSources)
  const properties = useLiveQuery(() => collections?.properties)
  const views = useLiveQuery(() => collections?.views)

  if (!scope) {
    return {
      data: undefined,
      error: null,
      refetch: async () => undefined,
      scope: null,
      status: "idle",
    }
  }

  if (!collections || !(facade instanceof SessionDatabaseClient)) {
    return {
      data: publicBootstrap.data,
      error: publicBootstrap.error instanceof Error
        ? publicBootstrap.error
        : publicBootstrap.error
          ? new Error(String(publicBootstrap.error))
          : null,
      refetch: publicBootstrap.refetch,
      scope,
      status: publicBootstrap.isError
        ? "error"
        : publicBootstrap.isLoading
          ? "loading"
          : publicBootstrap.data
            ? "success"
            : "idle",
    }
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

  return { ...state, data, refetch: () => facade.reset(scope), scope }
}
