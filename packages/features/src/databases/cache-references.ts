import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { sharedClient, type SharedClient } from "../data/client";
import {
  databaseBootstrapResponseSchema,
  databasePropertyEntitySchema,
  databaseHostEntitySchema,
  databaseViewEntitySchema,
  dataSourceEntitySchema,
  pagePropertyEntitySchema,
  type DatabaseBootstrapResponse,
} from "./core/entities";
import {
  hostCacheEntitySchema,
  sourceCacheEntitySchema,
  sourceLinkIdentity,
  viewCacheEntitySchema,
  bindingCacheEntitySchema,
} from "./schema/cache-entities";

// Query owns authorized membership and read revision, not canonical entity fields.
export const databaseBootstrapReferenceSchema = z
  .object({
    cacheId: z.string(),
    databaseId: z.string(),
    databaseVersion: z.number().int().nonnegative(),
    accessLevel: databaseHostEntitySchema.shape.accessLevel,
    sourceIds: z.array(z.string()),
    bindingIds: z.array(z.string()),
    viewIds: z.array(z.string()),
    includeDeleted: z.boolean(),
  })
  .strict();
export type DatabaseBootstrapReference = z.infer<typeof databaseBootstrapReferenceSchema>;

export function normalizeDatabaseBootstrap(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  databaseId: string,
  input: unknown,
  includeDeleted = false,
): DatabaseBootstrapReference {
  const incoming = databaseBootstrapResponseSchema.parse(input);
  const owner = sharedClient(client).resolve(
    read,
    incoming.database.workspaceId,
    read.identity.viewer.kind === "public" ? { kind: "public", id: databaseId } : undefined,
  );
  const result = owner.databases.ingestBootstrap(databaseId, incoming);
  return {
    cacheId: owner.session.id,
    databaseId,
    databaseVersion: result.version,
    accessLevel: result.accessLevel,
    sourceIds: result.sourceIds,
    bindingIds: result.bindingIds,
    viewIds: result.viewIds,
    includeDeleted,
  };
}

export function resolveDatabaseBootstrap(
  client: QueryClient,
  input: unknown,
  confirmed = false,
): DatabaseBootstrapResponse | undefined {
  const parsed = databaseBootstrapReferenceSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const owner = sharedClient(client).get(parsed.data.cacheId);
  if (!owner) return undefined;
  const { bindingIds, sourceIds, viewIds, databaseId, accessLevel, includeDeleted } = parsed.data;
  const host = confirmed
    ? owner.databases.hosts.collection.base.get(databaseId)
    : owner.databases.hosts.get(databaseId);
  if (!host) return undefined;
  const properties = bindingIds.flatMap((id) => {
    const binding = owner.databases.bindings.get(id);
    const definition = binding && owner.databases.definitions.get(binding.propertyId);
    if (!binding || !definition || (!includeDeleted && definition.deletedAt)) return [];
    return [
      databasePropertyEntitySchema.parse({
        ...bindingCacheEntitySchema.strip().parse(binding),
        property: pagePropertyEntitySchema.strip().parse(definition),
      }),
    ];
  });
  const dataSources = sourceIds
    .flatMap((id) => {
      const source = confirmed
        ? owner.databases.sources.collection.base.get(id)
        : owner.databases.sources.get(id);
      const link = owner.databases.links.get(sourceLinkIdentity(databaseId, id));
      return source && link
        ? [
            dataSourceEntitySchema.parse({
              ...sourceCacheEntitySchema.strip().parse(source),
              position: link.position,
              linkedAt: link.linkedAt,
            }),
          ]
        : [];
    })
    .sort((a, b) => a.position - b.position);
  const views = viewIds
    .flatMap((id) => {
      const view = confirmed
        ? owner.databases.views.collection.base.get(id)
        : owner.databases.views.get(id);
      if (!view || !dataSources.some((source) => source.id === view.dataSourceId)) return [];
      const { hostVersion: _hostVersion, ...fields } = viewCacheEntitySchema.strip().parse(view);
      return [databaseViewEntitySchema.parse(fields)];
    })
    .sort((a, b) => a.position - b.position);
  return {
    database: databaseHostEntitySchema.strip().parse({
      ...hostCacheEntitySchema.strip().parse(host),
      accessLevel,
    }),
    dataSources,
    properties: properties.sort((a, b) => a.position - b.position),
    views,
  };
}

/** Only typed, admitted facets update result memberships; record filters stay server-owned. */
export function reconcileBootstrapReferences(
  client: QueryClient,
  event: import("./core/entities").DatabaseMutationEventV2,
  cacheId: string,
) {
  const reconcile = (
    ref: DatabaseBootstrapReference,
    viewId?: string,
  ): DatabaseBootstrapReference => {
    if (
      ref.cacheId !== cacheId ||
      ref.databaseId !== event.databaseId ||
      event.version < ref.databaseVersion
    )
      return ref;
    const sources = new Set(
      ref.sourceIds.filter((id) => !event.changes.removedDataSourceIds?.includes(id)),
    );
    const bindings = new Set(
      ref.bindingIds.filter(
        (id) => ref.includeDeleted || !event.changes.removedPropertyIds?.includes(id),
      ),
    );
    for (const binding of event.changes.properties ?? [])
      if (sources.has(binding.dataSourceId) && (ref.includeDeleted || !binding.property.deletedAt))
        bindings.add(binding.id);
    const views = new Set(ref.viewIds.filter((id) => !event.changes.removedViewIds?.includes(id)));
    for (const view of event.changes.views ?? [])
      if (sources.has(view.dataSourceId) && (!viewId || viewId === view.id)) views.add(view.id);
    return {
      ...ref,
      databaseVersion: event.version,
      sourceIds: [...sources],
      bindingIds: [...bindings],
      viewIds: [...views],
    };
  };
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[2] !== event.databaseId || query.queryKey[3] !== "bootstrap") continue;
    const parsed = databaseBootstrapReferenceSchema.safeParse(query.state.data);
    if (parsed.success)
      client.setQueryData(
        query.queryKey,
        reconcile(parsed.data, query.queryKey[4] ? String(query.queryKey[4]) : undefined),
      );
  }
  for (const query of client
    .getQueryCache()
    .findAll({ queryKey: ["database-context-export", event.databaseId] })) {
    const ref = query.state.data as
      | import("./export-references").DatabaseExportReference
      | undefined;
    if (ref?.bootstrap)
      client.setQueryData(query.queryKey, { ...ref, bootstrap: reconcile(ref.bootstrap) });
  }
  client.setQueriesData<import("../pages/cache").PageNavigationReference>(
    { queryKey: ["pages"] },
    (current) => {
      if (!current?.databases) return current;
      return {
        ...current,
        databases: current.databases.map((ref) => {
          if (
            ref.cacheId !== cacheId ||
            ref.id !== event.databaseId ||
            event.version < ref.databaseVersion
          )
            return ref;
          const sources = ref.sourceIds.filter(
            (id) => !event.changes.removedDataSourceIds?.includes(id),
          );
          const views = new Set(
            ref.viewIds.filter((id) => !event.changes.removedViewIds?.includes(id)),
          );
          for (const view of event.changes.views ?? [])
            if (sources.includes(view.dataSourceId)) views.add(view.id);
          return {
            ...ref,
            sourceIds: sources,
            viewIds: [...views],
            databaseVersion: event.version,
            primarySourceId:
              ref.primarySourceId && sources.includes(ref.primarySourceId)
                ? ref.primarySourceId
                : (sources[0] ?? null),
          };
        }),
      };
    },
  );
}
