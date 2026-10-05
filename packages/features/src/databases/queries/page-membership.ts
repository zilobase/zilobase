import type { QueryClient } from "@tanstack/react-query";
import { databaseBootstrapResponseSchema } from "../core/entities";
import { databaseViewQueryHash } from "../views/query-hash";

function referencesTitle(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(referencesTitle);
  const record = value as Record<string, unknown>;
  return (
    record.propertyId === "name" ||
    record.column === "name" ||
    Object.values(record).some(referencesTitle)
  );
}

/** Titles affect only results evaluated with a dependent filter or sort. */
export function refreshTitleMembership(client: QueryClient, pageIds: readonly string[]) {
  if (!pageIds.length) return;
  const windows = new Set<string>();
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[3] !== "bootstrap") continue;
    const parsed = databaseBootstrapResponseSchema.safeParse(query.state.data);
    if (!parsed.success) continue;
    const { database, views, properties } = parsed.data;
    for (const view of views) {
      const config = view.config ?? database.config;
      // Computed-property dependencies are conservatively recovered until the
      // result dependency migration handles their transitive graph (Pass 7).
      const formulas = properties.some(
        (binding) =>
          binding.dataSourceId === view.dataSourceId && binding.property.type === "formula",
      );
      if (!referencesTitle(config) && !formulas) continue;
      windows.add(
        JSON.stringify([
          query.queryKey[1],
          database.id,
          view.dataSourceId,
          databaseViewQueryHash(config, query.queryKey[5] === true),
          query.queryKey[5] === true,
        ]),
      );
    }
  }
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    const key = query.queryKey;
    if (key[3] !== "window") continue;
    if (windows.has(JSON.stringify([key[1], key[2], key[4], key[5], key[6]])))
      void client.invalidateQueries({ queryKey: key, exact: true }).catch(() => undefined);
  }
}
