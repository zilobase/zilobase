import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/context"

export type DatabaseRecord = {
  id: string
  workspaceId: string
  pageId: string | null
  accessLevel?: "view" | "edit" | "full" | null
  createdById?: string | null
  name: string
  config?: unknown
  dataSourceConfig?: unknown
  isFavorite?: boolean
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export function isDatabaseLocked(
  database: Pick<DatabaseRecord, "config"> | null | undefined,
) {
  if (
    !database?.config ||
    typeof database.config !== "object" ||
    Array.isArray(database.config)
  ) {
    return false
  }

  return (database.config as { locked?: unknown }).locked === true
}

export function getDatabaseEmoji(database: { config?: unknown }) {
  const config = database.config

  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    return null
  }

  const emoji = (config as { emoji?: unknown }).emoji

  return typeof emoji === "string" && emoji.length > 0 ? emoji : null
}

export function getDatabaseCover(database: Pick<DatabaseRecord, "config">) {
  if (
    !database.config ||
    typeof database.config !== "object" ||
    Array.isArray(database.config)
  ) {
    return null
  }

  const cover = (database.config as { cover?: unknown }).cover

  return typeof cover === "string" && cover.length > 0 ? cover : null
}

export function getDatabaseIconPosition(
  database: Pick<DatabaseRecord, "config">,
) {
  if (
    !database.config ||
    typeof database.config !== "object" ||
    Array.isArray(database.config)
  ) {
    return "inline" as const
  }

  return (database.config as { iconPosition?: unknown }).iconPosition === "top"
    ? "top" as const
    : "inline" as const
}

export type DatabaseProperty = {
  id: string
  dataSourceId: string
  propertyId: string
  position: number
  width?: number | null
  visible: boolean
  property: PageProperty
  createdAt: string
  updatedAt: string
}

export type PageProperty = {
  id: string
  workspaceId: string
  name: string
  type: string
  config?: unknown
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type DatabaseView = {
  id: string
  databaseId: string
  dataSourceId: string
  type: string
  name: string
  config?: unknown
  position: number
  createdAt: string
  updatedAt: string
}

export type DatabaseRow = {
  id: string
  dataSourceId: string
  pageId: string
  parentRowId?: string | null
  position: number
  page: {
    createdAt?: string
    deletedAt?: string | null
    id: string
    name: string
    metadata?: unknown
    updatedAt?: string
  }
  createdById?: string | null
  lastEditedById?: string | null
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type PagePropertyValue = {
  id: string
  pageId: string
  propertyId: string
  value: unknown
  createdAt: string
  updatedAt: string
}

export type DatabaseRowsPagination = {
  hasMore: boolean
  nextCursor: number | null
}

export type DatabasePayload = {
  activeDataSource: DataSourceRecord | null
  dataSources: DataSourceRecord[]
  database: DatabaseRecord
  properties: DatabaseProperty[]
  views: DatabaseView[]
  rows: DatabaseRow[]
  rowCount?: number
  rowsPagination?: DatabaseRowsPagination
  values: PagePropertyValue[]
}

export type DataSourceRecord = {
  id: string
  workspaceId: string
  parentDatabaseId: string
  createdById?: string | null
  name: string
  config?: unknown
  configVersion: number
  version: number
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  linkedAt?: string
  position?: number
}

export type DatabaseAccessRule = {
  id: string
  workspaceId: string
  databaseId: string
  targetType: "public" | "user" | "team"
  targetId: string
  accessLevel: "view" | "edit" | "full"
  createdAt: string
  updatedAt: string
}

export type DatabaseAccessPayload = { access: DatabaseAccessRule[] }

export const databaseAccessQueryKey = (
  databaseId: string | null | undefined,
) => ["database", databaseId ?? "none", "access"] as const

export const databaseAccessQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string | null | undefined,
) =>
  queryOptions({
    queryKey: databaseAccessQueryKey(databaseId),
    enabled: Boolean(databaseId),
    queryFn: async ({ signal }) => {
      if (!databaseId) return { access: [] }
      try {
        return await apiFetch<DatabaseAccessPayload>(
          `/databases/${databaseId}/access`,
          { method: "GET", signal },
        )
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 403
        ) {
          return { access: [] }
        }
        throw error
      }
    },
  })

export const databaseQueryKey = (
  databaseId: string | null | undefined,
  options?: {
    dataSourceId?: string
    includeDeleted?: boolean
    schemaOnly?: boolean
    viewId?: string
  },
) =>
  [
    "database",
    databaseId ?? "none",
    options?.schemaOnly ? "schema" : "full",
    options?.includeDeleted ? "include-deleted" : "active-only",
    options?.viewId ?? options?.dataSourceId ?? "primary-source",
  ] as const

export const databaseRootQueryKey = () => ["database"] as const

export const databasePayloadRootQueryKey = (
  databaseId: string | null | undefined,
) => ["database", databaseId ?? "none"] as const

export const databaseQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string | null | undefined,
  options?: {
    dataSourceId?: string
    includeDeleted?: boolean
    schemaOnly?: boolean
    viewId?: string
  },
) =>
  queryOptions({
    queryKey: databaseQueryKey(databaseId, options),
    enabled: Boolean(databaseId),
    queryFn: async ({ signal }) => {
      if (!databaseId) {
        throw new Error("databaseId is required")
      }

      const params = new URLSearchParams()

      if (options?.schemaOnly) {
        params.set("schemaOnly", "1")
      }

      if (options?.includeDeleted) {
        params.set("includeDeleted", "1")
      }

      if (options?.viewId) params.set("viewId", options.viewId)
      if (options?.dataSourceId) params.set("dataSourceId", options.dataSourceId)

      const queryString = params.toString()

      try {
        return await apiFetch<DatabasePayload>(
          `/databases/${databaseId}${queryString ? `?${queryString}` : ""}`,
          {
            method: "GET",
            signal,
          },
        )
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return null
        }

        throw error
      }
    },
  })
