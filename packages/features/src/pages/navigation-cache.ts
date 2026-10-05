import { normalizeNavigationReference } from "./navigation-references";
import type { QueryClient } from "@tanstack/react-query";

import { type NavDelta } from "./nav-delta";
import { pagesNavRootQueryKey } from "./queries";
import { sharedClient } from "../data/client";
import { type PageNavigationReference } from "./cache";

export function applyNavigationDeltaToCache(
  queryClient: QueryClient,
  workspaceId: string,
  delta: NavDelta | null | undefined,
) {
  if (!delta) return false;
  const queryKey = pagesNavRootQueryKey(workspaceId);
  const hasSnapshot = queryClient
    .getQueriesData<PageNavigationReference>({ queryKey })
    .some(([, current]) => current !== undefined);

  if (!hasSnapshot) {
    void queryClient.invalidateQueries({ queryKey });
    return false;
  }

  const read = sharedClient(queryClient).capture();
  const owner = sharedClient(queryClient).resolve(read, workspaceId);
  owner.session.batch(() => {
    const upserts = normalizeNavigationReference(queryClient, read, workspaceId, {
      pages: delta.upsertPages ?? [],
      databases: [],
      placements: delta.upsertPlacements ?? [],
    });
    const merge = <T extends { id: string }>(
      current: T[],
      updates: T[],
      removed: readonly string[] = [],
    ) => {
      const result = current.filter((item) => !removed.includes(item.id));
      for (const update of updates) {
        const index = result.findIndex((item) => item.id === update.id);
        if (index < 0) result.push(update);
        else result[index] = update;
      }
      return result;
    };
    queryClient.setQueriesData<PageNavigationReference | undefined>({ queryKey }, (current) =>
      current
        ? {
            databases: current.databases,
            pages: merge(current.pages, upserts.pages, delta.removePageIds),
            placements: merge(current.placements, upserts.placements, delta.removePlacementIds),
          }
        : current,
    );
  });
  if (delta.upsertDatabases?.length || delta.removeDatabaseIds?.length)
    void queryClient.invalidateQueries({ queryKey }).catch(() => undefined);
  return true;
}
