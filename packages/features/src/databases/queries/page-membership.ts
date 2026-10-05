import { resolveDatabaseBootstrap } from "../cache-references";
import type { QueryClient } from "@tanstack/react-query";
import { databaseViewQueryHash } from "../views/query-hash";

function referencesFields(value: unknown, fields: ReadonlySet<string>): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((value) => referencesFields(value, fields));
  const record = value as Record<string, unknown>;
  return (
    (typeof record.propertyId === "string" && fields.has(record.propertyId)) ||
    (typeof record.column === "string" && fields.has(record.column)) ||
    Object.values(record).some((value) => referencesFields(value, fields))
  );
}

/** Titles affect only results evaluated with a dependent filter or sort. */
export function refreshTitleMembership(client: QueryClient, pageIds: readonly string[]) {
  if (!pageIds.length) return;
  refreshPropertyMembership(client, ["name"]);
}

export function refreshPropertyMembership(client: QueryClient, propertyIds: readonly string[]) {
  if (!propertyIds.length) return;
  const fields = new Set(propertyIds);
  const windows = new Set<string>();
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[3] !== "bootstrap") continue;
    const parsed = resolveDatabaseBootstrap(client, query.state.data);
    if (!parsed) continue;
    const { database, views, properties } = parsed;
    for (const view of views) {
      const config = view.config ?? database.config;
      // Computed-property dependencies are conservatively recovered until the
      // result dependency migration handles their transitive graph (Pass 7).
      const formulas = properties.some(
        (binding) =>
          binding.dataSourceId === view.dataSourceId && binding.property.type === "formula",
      );
      if (!referencesFields(config, fields) && !formulas) continue;
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
