import type { PageNavigationPayload } from "../../pages/contracts";

export type FavoriteIntention = {
  hostId: string;
  value: boolean;
  confirmation?: { actorId: string; revision: number };
};

export function isNavigationSnapshot(value: unknown): value is PageNavigationPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PageNavigationPayload>;
  return (
    Array.isArray(candidate.databases) &&
    Array.isArray(candidate.pages) &&
    Array.isArray(candidate.placements)
  );
}

export function favoriteNeedsProjection(
  effect: FavoriteIntention,
  snapshot: PageNavigationPayload,
) {
  const database = snapshot.databases.find(({ id }) => id === effect.hostId);
  if (!database) return false;
  const confirmed = effect.confirmation;
  return (
    !confirmed ||
    !database.actorState ||
    database.actorState.actorId !== confirmed.actorId ||
    database.actorState.revision < confirmed.revision
  );
}

export function projectDatabaseFavorites(
  snapshot: PageNavigationPayload,
  intentions: readonly { favorite?: FavoriteIntention }[],
): PageNavigationPayload {
  let result = snapshot;
  for (const { favorite } of intentions) {
    if (!favorite || !favoriteNeedsProjection(favorite, snapshot)) continue;
    result = {
      ...result,
      databases: result.databases.map((database) =>
        database.id === favorite.hostId ? { ...database, isFavorite: favorite.value } : database,
      ),
    };
  }
  return result;
}

/** Read reconciliation preserves newer actor state, never speculative values. */
export function preferNewestDatabaseActorState(
  incoming: PageNavigationPayload,
  cached?: PageNavigationPayload,
): PageNavigationPayload {
  if (!cached) return incoming;
  const previous = new Map(cached.databases.map((database) => [database.id, database]));
  return {
    ...incoming,
    databases: incoming.databases.map((database) => {
      const current = previous.get(database.id)?.actorState;
      const next = database.actorState;
      return current && next && current.actorId === next.actorId && current.revision > next.revision
        ? { ...database, actorState: current, isFavorite: current.isFavorite }
        : database;
    }),
  };
}
