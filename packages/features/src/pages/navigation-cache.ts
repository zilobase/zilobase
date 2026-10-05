import type { QueryClient } from "@tanstack/react-query";

import { applyNavDelta, type NavDelta } from "./nav-delta";
import { pagesNavRootQueryKey } from "./queries";
import { sharedClient } from "../data/client";
import {
  stageAuthorizedPages,
  resolveNavigationReference,
  type PageNavigationReference,
} from "./cache";

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
  const upserts = stageAuthorizedPages(queryClient, read, workspaceId, delta.upsertPages ?? []);
  queryClient.setQueriesData<PageNavigationReference | undefined>({ queryKey }, (current) => {
    if (!current) return current;
    const updated = applyNavDelta(resolveNavigationReference(queryClient, current), delta)!;
    const references = new Map(current.pages.map((page) => [page.id, page]));
    for (const page of upserts) references.set(page.id, page);
    return { ...updated, pages: updated.pages.map((page) => references.get(page.id)!) };
  });
  if (delta.upsertDatabases?.length || delta.removeDatabaseIds?.length)
    void queryClient.invalidateQueries({ queryKey }).catch(() => undefined);
  return true;
}
