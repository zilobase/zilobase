export { getDatabaseEmoji, getDatabaseCover, isDatabaseLocked } from "./appearance";
import type { DatabaseRecord, DatabasePayload, DatabaseAccessPayload } from "./contracts";
export type {
  DatabaseRecord,
  DatabaseProperty,
  PageProperty,
  DatabaseView,
  DatabaseRow,
  PagePropertyValue,
  DatabaseRowsPagination,
  DatabasePayload,
  DataSourceRecord,
  DatabaseAccessRule,
  DatabaseAccessPayload,
} from "./contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/api-fetcher"

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

export const databaseContextExportQueryKey = (
  databaseId: string | null | undefined,
  dataSourceId?: string,
) => [
  "database-context-export",
  databaseId ?? "none",
  dataSourceId ?? "primary-source",
] as const

export const databaseContextExportRootQueryKey = (
  databaseId: string | null | undefined,
) => ["database-context-export", databaseId ?? "none"] as const

export const databaseContextExportQueryOptions = (
  apiFetch: ApiFetcher,
  databaseId: string,
  dataSourceId?: string,
) => queryOptions({
  queryKey: databaseContextExportQueryKey(databaseId, dataSourceId),
  queryFn: ({ signal }) => {
    const query = dataSourceId
      ? `?dataSourceId=${encodeURIComponent(dataSourceId)}`
      : ""
    return apiFetch<DatabasePayload>(
      `/databases/${encodeURIComponent(databaseId)}/export${query}`,
      { method: "GET", signal },
    )
  },
  staleTime: 30_000,
})

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
