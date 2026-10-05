import { sharedClient } from "../../data/client";
import { dependentFields } from "./dependencies";
import { normalizeDatabaseViewQuery } from "../views/query-hash";
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
  const sources = new Set(
    sharedClient(client)
      .all()
      .flatMap((owner) => owner.databases.sourcesForPages(pageIds)),
  );
  refreshPropertyMembership(client, ["name"], { sources });
}

export function refreshPropertyMembership(
  client: QueryClient,
  propertyIds: readonly string[],
  options: { sources?: ReadonlySet<string>; definitionsChanged?: boolean } = {},
) {
  if (!propertyIds.length) return;
  const fields = new Set(propertyIds);
  const windows = new Set<string>();
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[3] !== "bootstrap") continue;
    const parsed = resolveDatabaseBootstrap(client, query.state.data, true);
    if (!parsed) continue;
    const { database, views, properties } = parsed;
    for (const view of views) {
      if (options.sources && !options.sources.has(view.dataSourceId)) continue;
      const config = view.config ?? database.config;
      const sourceProperties = properties.filter(
        (binding) => binding.dataSourceId === view.dataSourceId,
      );
      if (
        !fields.has("name") &&
        !sourceProperties.some(
          (binding) => fields.has(binding.id) || fields.has(binding.propertyId),
        )
      )
        continue;
      const dependent = dependentFields(sourceProperties, fields, options.definitionsChanged);
      if (!referencesFields(normalizeDatabaseViewQuery(config), dependent)) continue;
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
