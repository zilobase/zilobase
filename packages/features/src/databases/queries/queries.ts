export { getDatabaseEmoji, getDatabaseCover, isDatabaseLocked } from  "../views/appearance";
import type { DatabaseRecord, DatabasePayload, DatabaseAccessPayload } from  "../core/legacy-contracts";
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
} from  "../core/legacy-contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from  "../../shared/api-fetcher"

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

export const databaseRootQueryKey = () => ["database"] as const

export const databaseQueryRootKey = (
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
