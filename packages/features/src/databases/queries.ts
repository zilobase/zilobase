import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type DatabaseRecord = {
  id: string
  organizationId: string
  pageId: string
  name: string
  config?: unknown
  version: number
  isFavorite?: boolean
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export function getDatabaseEmoji(database: Pick<DatabaseRecord, "config">) {
  if (
    !database.config ||
    typeof database.config !== "object" ||
    Array.isArray(database.config)
  ) {
    return null
  }

  const emoji = (database.config as { emoji?: unknown }).emoji

  return typeof emoji === "string" && emoji.length > 0 ? emoji : null
}

export type DatabaseProperty = {
  id: string
  databaseId: string
  propertyId: string
  position: number
  width?: number | null
  visible: boolean
  property: WorkspaceProperty
  createdAt: string
  updatedAt: string
}

export type WorkspaceProperty = {
  id: string
  organizationId: string
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
  type: string
  name: string
  config?: unknown
  position: number
  createdAt: string
  updatedAt: string
}

export type DatabaseRow = {
  id: string
  databaseId: string
  pageId: string
  parentRowId?: string | null
  position: number
  page: {
    createdAt?: string
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

export type WorkspacePropertyValue = {
  id: string
  workspaceId: string
  propertyId: string
  value: unknown
  createdAt: string
  updatedAt: string
}

export type DatabasePayload = {
  clientMutationId?: string
  database: DatabaseRecord
  mutationId?: string
  properties: DatabaseProperty[]
  views: DatabaseView[]
  rows: DatabaseRow[]
  values: WorkspacePropertyValue[]
}

export const databaseQueryKey = (databaseId: string | null | undefined) =>
  ["database", databaseId ?? "none"] as const

export const databaseQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string | null | undefined,
) =>
  queryOptions({
    queryKey: databaseQueryKey(databaseId),
    enabled: Boolean(databaseId),
    queryFn: async () => {
      if (!databaseId) {
        throw new Error("databaseId is required")
      }

      try {
        return await apiFetch<DatabasePayload>(`/databases/${databaseId}`, {
          method: "GET",
        })
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
