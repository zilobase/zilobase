import type { QueryClient } from "@tanstack/react-query";

import type { ApiFetcher } from "../../shared/api-fetcher";
import {
  databaseBootstrapResponseSchema,
  databaseRecordWindowResponseSchema,
  type DatabaseBootstrapResponse,
  type DatabaseRecordEntity,
} from "../core/entities";
import { databaseQueryRoot } from "../queries/keys";

export type DataSourceCommandScope = {
  dataSourceId: string;
  hostDatabaseId: string;
};

export async function resolveDataSourceCommandScope(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  databaseOrSourceId: string,
  explicitHostDatabaseId?: string,
): Promise<DataSourceCommandScope> {
  if (explicitHostDatabaseId) {
    return {
      dataSourceId: databaseOrSourceId,
      hostDatabaseId: explicitHostDatabaseId,
    };
  }

  const sourceBootstrap = findDataSourceBootstrap(
    queryClient,
    databaseOrSourceId,
  );
  if (sourceBootstrap) {
    return {
      dataSourceId: databaseOrSourceId,
      hostDatabaseId: sourceBootstrap.database.id,
    };
  }

  for (const candidate of cachedBootstraps(queryClient)) {
    if (candidate.database.id !== databaseOrSourceId) continue;
    const source = candidate.dataSources[0];
    if (!source) break;
    return {
      dataSourceId: source.id,
      hostDatabaseId: candidate.database.id,
    };
  }

  const bootstrap = databaseBootstrapResponseSchema.parse(
    await apiFetch(
      `/databases/${encodeURIComponent(databaseOrSourceId)}/bootstrap`,
    ),
  );
  const source = bootstrap.dataSources[0];
  if (!source) {
    throw new Error(`Database ${databaseOrSourceId} has no data source`);
  }
  return {
    dataSourceId: source.id,
    hostDatabaseId: bootstrap.database.id,
  };
}

export function findDataSourceBootstrap(
  queryClient: QueryClient,
  dataSourceId: string,
): DatabaseBootstrapResponse | null {
  return cachedBootstraps(queryClient).find((candidate) =>
    candidate.dataSources.some(({ id }) => id === dataSourceId)
  ) ?? null;
}

export function findLoadedDataSourceRecords(
  queryClient: QueryClient,
  dataSourceId: string,
): DatabaseRecordEntity[] {
  for (
    const [, candidate] of queryClient.getQueriesData({
      queryKey: [databaseQueryRoot],
    })
  ) {
    const direct = databaseRecordWindowResponseSchema.safeParse(candidate);
    if (
      direct.success &&
      direct.data.records.some((record) =>
        record.dataSourceId === dataSourceId
      )
    ) {
      return direct.data.records;
    }
    if (
      !candidate || typeof candidate !== "object" || !("pages" in candidate)
    ) {
      continue;
    }
    const pages = (candidate as { pages?: unknown }).pages;
    if (!Array.isArray(pages)) continue;
    const latest = databaseRecordWindowResponseSchema.safeParse(
      pages.at(-1),
    );
    if (
      latest.success &&
      latest.data.records.some((record) =>
        record.dataSourceId === dataSourceId
      )
    ) {
      return latest.data.records;
    }
  }
  return [];
}

/**
 * For cell.set from page-metadata (no source in presenceTarget):
 * first try cached windows for record id===rowId, then bootstrap
 * dataSources[0], then throw.
 */
export async function resolveCellCommandScope(
  queryClient: QueryClient,
  apiFetch: ApiFetcher,
  hostDatabaseId: string,
  rowId: string,
): Promise<DataSourceCommandScope> {
  for (
    const [, candidate] of queryClient.getQueriesData({
      queryKey: [databaseQueryRoot],
    })
  ) {
    const windows = recordWindows(candidate);
    for (const window of windows) {
      const match = window.records.find((record) => record.id === rowId);
      if (match) {
        return {
          dataSourceId: match.dataSourceId,
          hostDatabaseId,
        };
      }
    }
  }

  for (const candidate of cachedBootstraps(queryClient)) {
    if (candidate.database.id !== hostDatabaseId) continue;
    const source = candidate.dataSources[0];
    if (!source) break;
    return { dataSourceId: source.id, hostDatabaseId };
  }

  const bootstrap = databaseBootstrapResponseSchema.parse(
    await apiFetch(
      `/databases/${encodeURIComponent(hostDatabaseId)}/bootstrap`,
    ),
  );
  const source = bootstrap.dataSources[0];
  if (!source) {
    throw new Error(`Database ${hostDatabaseId} has no data source`);
  }
  return { dataSourceId: source.id, hostDatabaseId: bootstrap.database.id };
}

function cachedBootstraps(
  queryClient: QueryClient,
): DatabaseBootstrapResponse[] {
  return queryClient
    .getQueriesData({ queryKey: [databaseQueryRoot] })
    .flatMap(([, candidate]) => {
      const parsed = databaseBootstrapResponseSchema.safeParse(candidate);
      return parsed.success ? [parsed.data] : [];
    });
}

function recordWindows(value: unknown) {
  const direct = databaseRecordWindowResponseSchema.safeParse(value);
  if (direct.success) return [direct.data];
  if (!value || typeof value !== "object" || !("pages" in value)) return [];
  const pages = (value as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    const parsed = databaseRecordWindowResponseSchema.safeParse(page);
    return parsed.success ? [parsed.data] : [];
  });
}
