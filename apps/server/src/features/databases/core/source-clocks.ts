import type { DatabaseMutationChanges } from "@zilobase/features/databases/contracts";

export function mutationSourceIds(changes: DatabaseMutationChanges, dataSourceId?: string | null) {
  return [
    ...new Set([
      ...(dataSourceId ? [dataSourceId] : []),
      ...(changes.dataSources ?? []).map((source) => source.id),
      ...(changes.properties ?? []).map((binding) => binding.dataSourceId),
      ...(changes.records ?? []).map((record) => record.dataSourceId),
      ...(changes.views ?? []).map((view) => view.dataSourceId),
    ]),
  ].sort();
}

/** Never disclose other lanes reserved by a transfer or lifecycle operation. */
export function withSourceClocks(
  changes: DatabaseMutationChanges,
  dataSourceId: string | null | undefined,
  versions: Record<string, number>,
): DatabaseMutationChanges {
  const sourceVersions: Record<string, number> = {};
  for (const id of mutationSourceIds(changes, dataSourceId)) {
    const revision =
      versions[id] ?? changes.dataSources?.find((source) => source.id === id)?.version;
    if (revision === undefined) throw new Error(`Missing source confirmation clock: ${id}`);
    sourceVersions[id] = revision;
  }
  return Object.keys(sourceVersions).length ? { ...changes, sourceVersions } : changes;
}
