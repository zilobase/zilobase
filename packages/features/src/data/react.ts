import { useCallback, useSyncExternalStore } from "react";

import type { EntityCollection } from "./collection";

/** Consumers observe the session's coherent publication, not individual sync frames. */
export function useSharedEntity<T extends { id: string }>(owner: EntityCollection<T>, id: string) {
  const subscribe = useCallback((notify: () => void) => owner.subscribe(id, notify), [owner, id]);
  const getSnapshot = useCallback(() => owner.get(id), [owner, id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
