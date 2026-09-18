import type { QueryClient } from "@tanstack/react-query";

import {
  databaseBootstrapResponseSchema,
  databaseRecordWindowResponseSchema,
} from "../core/entities";

export const databaseQueryRoot = "db" as const;

export type DatabaseBootstrapScope = {
  databaseId: string;
  includeDeleted?: boolean;
  viewId?: string | null;
};

export type DatabaseWindowScope = {
  databaseId: string;
  dataSourceId: string;
  includeDeleted?: boolean;
  viewId: string;
};

export const databaseBootstrapQueryKey = (
  sessionId: string,
  scope: DatabaseBootstrapScope,
) =>
  [
    databaseQueryRoot,
    sessionId,
    scope.databaseId,
    "bootstrap",
    scope.viewId ?? null,
    scope.includeDeleted === true,
  ] as const;

export const databaseWindowQueryKey = (
  sessionId: string,
  scope: DatabaseWindowScope,
) =>
  [
    databaseQueryRoot,
    sessionId,
    scope.databaseId,
    "window",
    scope.dataSourceId,
    scope.viewId,
    scope.includeDeleted === true,
  ] as const;

export const sessionIdForQueries = (
  authSessionId: string | null | undefined,
) => authSessionId ?? "public";

function bootstrapVersionOf(value: unknown): number | null {
  const parsed = databaseBootstrapResponseSchema.safeParse(value);
  if (parsed.success) return parsed.data.database.version;
  return null;
}

function windowVersionOf(value: unknown): number | null {
  const direct = databaseRecordWindowResponseSchema.safeParse(value);
  if (direct.success) return direct.data.databaseVersion;
  if (!value || typeof value !== "object" || !("pages" in value)) return null;
  const pages = (value as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return null;
  let max: number | null = null;
  for (const page of pages) {
    const parsed = databaseRecordWindowResponseSchema.safeParse(page);
    if (parsed.success) {
      max = max === null
        ? parsed.data.databaseVersion
        : Math.max(max, parsed.data.databaseVersion);
    }
  }
  return max;
}

function versionsInValue(value: unknown): number[] {
  const bootstrap = bootstrapVersionOf(value);
  if (bootstrap !== null) return [bootstrap];
  const window = windowVersionOf(value);
  if (window !== null) {
    // For InfiniteData, windowVersionOf returns max; also collect each page
    // for MIN calculation. Expand pages when present.
    if (value && typeof value === "object" && "pages" in value) {
      const pages = (value as { pages?: unknown }).pages;
      if (Array.isArray(pages)) {
        const versions: number[] = [];
        for (const page of pages) {
          const parsed = databaseRecordWindowResponseSchema.safeParse(page);
          if (parsed.success) versions.push(parsed.data.databaseVersion);
        }
        if (versions.length > 0) return versions;
      }
    }
    return [window];
  }
  return [];
}

/**
 * MIN across all cached bootstrap + window versions for a host.
 * If one view is fresh (v10) but another is old (v8), a poke at v9 must
 * still refetch. Max/bootstrap-first would miss it. Min never misses
 * (at cost of extra refetch).
 */
export function cachedVersion(
  queryClient: QueryClient,
  sessionId: string,
  hostId: string,
): number {
  const versions: number[] = [];
  for (
    const [, data] of queryClient.getQueriesData({
      queryKey: [databaseQueryRoot, sessionId, hostId],
    })
  ) {
    versions.push(...versionsInValue(data));
  }
  return versions.length ? Math.min(...versions) : -1;
}

export function cachedWindowMaxVersion(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): number {
  const cached = queryClient.getQueryData(queryKey);
  if (!cached) return -1;
  if (
    cached && typeof cached === "object" && "pages" in cached &&
    Array.isArray((cached as { pages: unknown }).pages)
  ) {
    const pages = (cached as { pages: unknown[] }).pages;
    let max = -1;
    for (const page of pages) {
      const parsed = databaseRecordWindowResponseSchema.safeParse(page);
      if (parsed.success) max = Math.max(max, parsed.data.databaseVersion);
    }
    return max;
  }
  const direct = databaseRecordWindowResponseSchema.safeParse(cached);
  if (direct.success) return direct.data.databaseVersion;
  return -1;
}
