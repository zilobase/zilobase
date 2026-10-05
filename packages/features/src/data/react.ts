import { useCallback, useSyncExternalStore } from "react";

import type { EntityCollection } from "./collection";

/** Consumers observe the session's coherent publication, not individual sync frames. */
export function useSharedEntity<T extends { id: string }>(owner: EntityCollection<T>, id: string) {
  const subscribe = useCallback((notify: () => void) => owner.subscribe(id, notify), [owner, id]);
  const getSnapshot = useCallback(() => owner.get(id), [owner, id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

import type { QueryClient } from "@tanstack/react-query";
import { sharedClient } from "./client";

/** A publication revision changes only after every staged collection has committed. */
export function useSharedDataRevision(queryClient: QueryClient) {
  const owner = sharedClient(queryClient);
  return useSyncExternalStore(
    owner.publication.subscribe,
    owner.publication.getRevision,
    owner.publication.getRevision,
  );
}
