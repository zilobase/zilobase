import { useMemo } from "react"

import {
  useOptionalDatabaseClient,
  type DatabaseBootstrapResponse,
  type DatabasePayload,
  type DataSourceEntity,
} from "@zilobase/features/databases"
import {
  useDatabase,
  useDatabaseBootstrap,
} from "@zilobase/features/databases/react"

export function useDatabaseMetadata(
  databaseId: string | null | undefined,
  options?: {
    dataSourceId?: string | null
    includeDeleted?: boolean
    viewId?: string | null
  },
) {
  const databaseClient = useOptionalDatabaseClient()
  const useCollections = Boolean(databaseClient)
  const bootstrap = useDatabaseBootstrap(
    useCollections && databaseId
      ? {
          databaseId,
          includeDeleted: options?.includeDeleted,
          viewId: options?.viewId,
        }
      : null,
  )
  const legacy = useDatabase(useCollections ? null : databaseId, {
    dataSourceId: options?.dataSourceId ?? undefined,
    includeDeleted: options?.includeDeleted,
    schemaOnly: true,
    viewId: options?.viewId ?? undefined,
  })
  const data = useMemo(() => {
    if (!useCollections) return normalizeLegacyMetadata(legacy.data)
    if (!bootstrap.data) return undefined

    const activeView = options?.viewId
      ? bootstrap.data.views.find((view) => view.id === options.viewId)
      : bootstrap.data.views[0]
    const activeDataSource = bootstrap.data.dataSources.find(
      (source) => source.id === (options?.dataSourceId ?? activeView?.dataSourceId),
    ) ?? bootstrap.data.dataSources[0] ?? null

    return {
      ...bootstrap.data,
      activeDataSource,
    }
  }, [bootstrap.data, legacy.data, options?.dataSourceId, options?.viewId, useCollections])

  return {
    data,
    error: useCollections ? bootstrap.error : legacy.error,
    isError: useCollections ? bootstrap.status === "error" : legacy.isError,
    isLoading: useCollections
      ? bootstrap.status === "loading"
      : legacy.isLoading,
    refetch: async () => {
      if (useCollections && databaseClient && databaseId) {
        await databaseClient.reset({
          databaseId,
          includeDeleted: options?.includeDeleted,
          viewId: options?.viewId,
        })
        return
      }
      await legacy.refetch()
    },
  }
}

type DatabaseMetadata = DatabaseBootstrapResponse & {
  activeDataSource: DataSourceEntity | null
}

function normalizeLegacyMetadata(
  payload: DatabasePayload | null | undefined,
): DatabaseMetadata | undefined {
  if (!payload) return undefined
  const dataSources = payload.dataSources.map((source, position) => ({
    config: source.config ?? {},
    configVersion: source.configVersion,
    createdAt: source.createdAt,
    id: source.id,
    linkedAt: source.linkedAt ?? null,
    name: source.name,
    parentDatabaseId: source.parentDatabaseId,
    position: source.position ?? position,
    updatedAt: source.updatedAt,
    version: source.version,
    workspaceId: source.workspaceId,
  }))

  return {
    activeDataSource:
      dataSources.find((source) => source.id === payload.activeDataSource?.id) ??
      dataSources[0] ??
      null,
    database: {
      accessLevel: payload.database.accessLevel ?? null,
      config: payload.database.config ?? {},
      createdAt: payload.database.createdAt,
      id: payload.database.id,
      name: payload.database.name,
      pageId: payload.database.pageId,
      updatedAt: payload.database.updatedAt,
      version: payload.database.version,
      workspaceId: payload.database.workspaceId,
    },
    dataSources,
    properties: payload.properties.map((property) => ({
      createdAt: property.createdAt,
      dataSourceId: property.dataSourceId,
      id: property.id,
      position: property.position,
      property: {
        config: property.property.config ?? {},
        createdAt: property.property.createdAt,
        id: property.property.id,
        name: property.property.name,
        type: property.property.type,
        updatedAt: property.property.updatedAt,
        workspaceId: property.property.workspaceId,
      },
      propertyId: property.propertyId,
      updatedAt: property.updatedAt,
      visible: property.visible,
      width: property.width ?? null,
    })),
    views: payload.views.map((view) => ({
      config: view.config ?? {},
      createdAt: view.createdAt,
      databaseId: view.databaseId,
      dataSourceId: view.dataSourceId,
      id: view.id,
      name: view.name,
      position: view.position,
      type: view.type,
      updatedAt: view.updatedAt,
    })),
  }
}
