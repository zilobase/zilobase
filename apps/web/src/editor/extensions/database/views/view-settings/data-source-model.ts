import type { DatabaseSourceMenuItem } from "./types";

export function partitionManagedDataSources(
  dataSources: DatabaseSourceMenuItem[],
  hostDatabaseId: string | undefined,
) {
  const owned: DatabaseSourceMenuItem[] = [];
  const linked: DatabaseSourceMenuItem[] = [];

  for (const source of dataSources) {
    const isOwned = source.parentDatabaseId === hostDatabaseId;

    if (isOwned) {
      owned.push(source);
    } else if (source.viewCount > 0) {
      linked.push(source);
    }
  }

  return { linked, owned };
}
