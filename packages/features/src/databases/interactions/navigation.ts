import type { PageDatabase, PageNavigationPayload } from "../../pages/contracts";
import { applyConfigurationChanges } from "./configuration";
import type { MetadataEffect, MetadataIntention } from "./metadata";
import { preferNewestDatabaseActorState, projectDatabaseFavorites } from "./favorites";
import type { DatabaseIntention } from "./model";

export function navigationMetadataNeedsProjection(
  effect: MetadataEffect,
  intention: MetadataIntention,
  snapshot: PageNavigationPayload,
) {
  if (effect.kind === "property") return false; // Navigation has no schema slice.
  return snapshot.databases.some((database) => needsProjection(database, effect, intention));
}

function needsProjection(
  database: PageDatabase,
  effect: MetadataEffect,
  intention: MetadataIntention,
) {
  if (effect.kind === "property") return false;
  const state = database.metadataState;
  if (effect.kind === "source") {
    if (!state?.primarySource || state.primarySource.id !== effect.dataSourceId) return false;
    const version = intention.sourceVersions?.[effect.dataSourceId!];
    return version === undefined || state.primarySource.version < version;
  }
  if (database.id !== effect.hostId) return false;
  const version = intention.hostVersions?.[effect.hostId];
  return version === undefined || !state || state.version < version;
}

export function projectDatabaseNavigation(
  snapshot: PageNavigationPayload,
  intentions: readonly DatabaseIntention[],
): PageNavigationPayload {
  let result = projectDatabaseFavorites(snapshot, intentions);
  for (const intention of intentions)
    for (const effect of intention.metadataEffects ?? []) {
      if (!navigationMetadataNeedsProjection(effect, intention, snapshot)) continue;
      result = {
        ...result,
        databases: result.databases.map((database) => {
          const original = snapshot.databases.find(({ id }) => id === database.id)!;
          if (!needsProjection(original, effect, intention)) return database;
          if (effect.kind === "database")
            return {
              ...database,
              ...effect.patch,
              ...(effect.configuration
                ? { config: applyConfigurationChanges(database.config, effect.configuration) }
                : {}),
            };
          if (effect.kind === "source")
            return {
              ...database,
              ...(effect.configuration
                ? {
                    dataSourceConfig: applyConfigurationChanges(
                      database.dataSourceConfig,
                      effect.configuration,
                    ),
                  }
                : {}),
            };
          if (effect.kind !== "view") return database;
          let views = database.views.map((view) =>
            view.id === effect.id
              ? {
                  ...view,
                  ...effect.patch,
                  ...(effect.configuration
                    ? { config: applyConfigurationChanges(view.config, effect.configuration) }
                    : {}),
                }
              : view,
          );
          if (effect.placement) {
            const moving = views.find(({ id }) => id === effect.id);
            if (moving) {
              views = views
                .filter(({ id }) => id !== effect.id)
                .sort((a, b) => a.position - b.position);
              const before = views.findIndex(({ id }) => id === effect.placement!.beforeId);
              const after = views.findIndex(({ id }) => id === effect.placement!.afterId);
              views.splice(before >= 0 ? before : after >= 0 ? after + 1 : views.length, 0, moving);
              views = views.map((view, position) => ({ ...view, position }));
            }
          }
          return { ...database, views };
        }),
      };
    }
  return result;
}

/** Independently reconcile host, source and actor clocks. Never resurrect absent items. */
export function preferNewestDatabaseNavigation(
  incoming: PageNavigationPayload,
  cached?: PageNavigationPayload,
) {
  if (!cached) return incoming;
  const previous = new Map(cached.databases.map((database) => [database.id, database]));
  const next = {
    ...incoming,
    databases: incoming.databases.map((database) => {
      const older = previous.get(database.id);
      if (!older?.metadataState || !database.metadataState) return database;
      let result = database;
      if (older.metadataState.version > database.metadataState.version)
        result = {
          ...database,
          name: older.name,
          config: older.config,
          views: older.views,
          metadataState: {
            ...database.metadataState,
            version: older.metadataState.version,
            primarySource: older.metadataState.primarySource,
          },
          dataSourceConfig: older.dataSourceConfig,
        };
      const source = older.metadataState.primarySource;
      const incomingSource = database.metadataState.primarySource;
      if (
        source &&
        incomingSource &&
        source.id === incomingSource.id &&
        incomingSource.version > source.version
      )
        result = {
          ...result,
          dataSourceConfig: database.dataSourceConfig,
          metadataState: { ...result.metadataState!, primarySource: incomingSource },
        };
      else if (
        source &&
        result.metadataState?.primarySource?.id === source.id &&
        source.version > result.metadataState.primarySource.version
      )
        result = {
          ...result,
          dataSourceConfig: older.dataSourceConfig,
          metadataState: { ...result.metadataState, primarySource: source },
        };
      return result;
    }),
  };
  return preferNewestDatabaseActorState(next, cached);
}
