import type { QueryClient } from "@tanstack/react-query";
import { databaseBootstrapResponseSchema, type DatabaseBootstrapResponse } from "../core/entities";

export type DataSourceCommandScope = { dataSourceId: string; hostDatabaseId: string };

/** Source IDs are never interpreted as host IDs and scopes never cross sessions. */
export function resolveDataSourceCommandScope(
  queryClient: QueryClient,
  sessionId: string,
  dataSourceId: string,
  explicitHostDatabaseId?: string,
): DataSourceCommandScope {
  if (explicitHostDatabaseId) return { dataSourceId, hostDatabaseId: explicitHostDatabaseId };
  const snapshot = findDataSourceBootstrap(queryClient, sessionId, dataSourceId);
  if (!snapshot)
    throw new Error("Database source is not loaded in this session; provide its host explicitly");
  return { dataSourceId, hostDatabaseId: snapshot.database.id };
}

export function findDataSourceBootstrap(
  queryClient: QueryClient,
  sessionId: string,
  dataSourceId: string,
): DatabaseBootstrapResponse | null {
  return (
    queryClient
      .getQueriesData({ queryKey: ["db", sessionId] })
      .flatMap(([, value]) => {
        const parsed = databaseBootstrapResponseSchema.safeParse(value);
        return parsed.success && parsed.data.dataSources.some(({ id }) => id === dataSourceId)
          ? [parsed.data]
          : [];
      })
      .sort(
        (a, b) =>
          b.dataSources.find(({ id }) => id === dataSourceId)!.version -
            a.dataSources.find(({ id }) => id === dataSourceId)!.version ||
          b.database.version - a.database.version,
      )[0] ?? null
  );
}
