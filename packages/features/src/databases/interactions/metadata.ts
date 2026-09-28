import type {
  DatabaseBootstrapResponse,
  DatabasePropertyEntity,
  DatabaseViewEntity,
  DataSourceEntity,
  DatabaseHostEntity,
} from "../core/entities";
import { applyConfigurationChanges, type ConfigurationChange } from "./configuration";

export type MetadataEffect = {
  hostId: string;
  dataSourceId?: string;
  kind: "database" | "source" | "view" | "property";
  id: string;
  patch?: Record<string, unknown>;
  configuration?: ConfigurationChange[];
  propertyPatch?: Record<string, unknown>;
  propertyConfiguration?: ConfigurationChange[];
  insert?: DatabasePropertyEntity | DatabaseViewEntity | DataSourceEntity;
  remove?: boolean;
};
export type MetadataIntention = {
  metadataEffects?: readonly MetadataEffect[];
  hostVersions?: Readonly<Record<string, number>>;
  sourceVersions?: Readonly<Record<string, number>>;
};

export function metadataNeedsProjection(
  effect: MetadataEffect,
  intention: MetadataIntention,
  snapshot: DatabaseBootstrapResponse,
) {
  if (effect.dataSourceId) {
    const source = snapshot.dataSources.find(({ id }) => id === effect.dataSourceId);
    if (!source) return false;
    const version = intention.sourceVersions?.[effect.dataSourceId];
    return version === undefined || source.version < version;
  }
  if (snapshot.database.id !== effect.hostId) return false;
  const version = intention.hostVersions?.[effect.hostId];
  return version === undefined || snapshot.database.version < version;
}

export function projectDatabaseMetadata(
  snapshot: DatabaseBootstrapResponse,
  intentions: readonly MetadataIntention[],
): DatabaseBootstrapResponse {
  let result = snapshot;
  for (const intention of intentions)
    for (const effect of intention.metadataEffects ?? []) {
      if (!metadataNeedsProjection(effect, intention, snapshot)) continue;
      const patch = <T extends { id: string }>(entity: T): T => {
        const next = { ...entity, ...effect.patch };
        if (effect.configuration)
          Object.assign(next, {
            config: applyConfigurationChanges(
              (entity as { config?: unknown }).config,
              effect.configuration,
            ),
          });
        if (effect.kind === "property") {
          const property = (entity as unknown as DatabasePropertyEntity).property;
          Object.assign(next, {
            property: {
              ...property,
              ...effect.propertyPatch,
              ...(effect.propertyConfiguration
                ? {
                    config: applyConfigurationChanges(
                      property.config,
                      effect.propertyConfiguration,
                    ),
                  }
                : {}),
            },
          });
        }
        return next;
      };
      const change = <T extends { id: string }>(entities: T[]) => {
        if (effect.remove) return entities.filter(({ id }) => id !== effect.id);
        const exists = entities.some(({ id }) => id === effect.id);
        const values =
          !exists && effect.insert ? [...entities, effect.insert as unknown as T] : entities;
        return values.map((entity) => (entity.id === effect.id ? patch(entity) : entity));
      };
      switch (effect.kind) {
        case "database":
          result = { ...result, database: patch(result.database) as DatabaseHostEntity };
          break;
        case "source":
          result = { ...result, dataSources: change(result.dataSources) };
          break;
        case "view":
          result = { ...result, views: change(result.views) };
          break;
        case "property":
          result = { ...result, properties: change(result.properties) };
          break;
      }
    }
  return result;
}
