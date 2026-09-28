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
  placement?: { afterId: string | null; beforeId: string | null };
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
        let updated = values.map((entity) => (entity.id === effect.id ? patch(entity) : entity));
        if (effect.placement) {
          const moving = updated.find(({ id }) => id === effect.id);
          if (!moving) return updated;
          const belongs = (entity: T) =>
            !effect.dataSourceId ||
            (entity as { dataSourceId?: string }).dataSourceId === effect.dataSourceId;
          const ordered = updated
            .filter((entity) => belongs(entity) && entity.id !== effect.id)
            .sort(
              (left, right) =>
                ((left as { position?: number }).position ?? 0) -
                ((right as { position?: number }).position ?? 0),
            );
          const before = ordered.findIndex(({ id }) => id === effect.placement!.beforeId);
          const after = ordered.findIndex(({ id }) => id === effect.placement!.afterId);
          ordered.splice(before >= 0 ? before : after >= 0 ? after + 1 : ordered.length, 0, moving);
          const positions = new Map(ordered.map(({ id }, position) => [id, position]));
          updated = updated.map((entity) =>
            positions.has(entity.id) ? { ...entity, position: positions.get(entity.id)! } : entity,
          );
        }
        return updated;
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
