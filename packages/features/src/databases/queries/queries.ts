import type { DatabaseAccessPayload } from  "../access/access-contracts";
import type { DatabaseExportPayload } from  "../core/export-payload";
export type {
  DatabaseRecord,
  DatabaseProperty,
  PageProperty,
  DatabaseView,
  DatabaseRow,
  PagePropertyValue,
  DatabaseRowsPagination,
  DatabaseExportPayload,
  DataSourceRecord,
} from  "../core/export-payload";
export type {
  DatabaseAccessRule,
  DatabaseAccessPayload,
} from  "../access/access-contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from  "../../shared/api-fetcher"

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
      return apiFetch<DatabaseExportPayload>(
      `/databases/${encodeURIComponent(databaseId)}/export${query}`,
      { method: "GET", signal },
    )
  },
  staleTime: 30_000,
})
