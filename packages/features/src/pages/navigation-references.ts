import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import type { DataSession } from "../data/session";
import { sharedClient, type SharedClient } from "../data/client";
import { prepareAuthorizedPages, type PageNavigationReference } from "./cache";
import type { PageDatabase, PageItemPlacement, PageNavigationPayload } from "./contracts";
import {
  hostCacheEntitySchema,
  sourceCacheEntitySchema,
  viewCacheEntitySchema,
} from "../databases/schema/cache-entities";

const placementSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    parentKind: z.enum(["page", "database"]),
    parentId: z.string().min(1),
    itemKind: z.enum(["page", "database"]),
    itemId: z.string().min(1),
    placementKind: z.enum(["primary", "linked", "database_row"]),
    sourceRowId: z.string().nullable().optional(),
    position: z.number().finite(),
    readSequence: z.number().int().nonnegative(),
  })
  .strict();
const preferenceSchema = z
  .object({
    id: z.string().min(1),
    actorId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    isFavorite: z.boolean(),
  })
  .strict();

export const pagePreferenceSchema = z
  .object({
    id: z.string().min(1),
    readSequence: z.number().int().nonnegative(),
    isFavorite: z.boolean().optional(),
    isShared: z.boolean().optional(),
    lastVisitedAt: z.string().datetime({ offset: true }).nullable().optional(),
    parentPageId: z.string().nullable().optional(),
    publishedOwnerPreferences: z.object({ pageFullWidth: z.boolean() }).nullable().optional(),
  })
  .strict();

export class NavigationCollections {
  readonly placements;
  readonly pagePreferences;
  readonly databasePreferences;
  readonly databaseContexts;
  constructor(session: DataSession) {
    this.pagePreferences = session.register({
      name: "page-preferences",
      schema: pagePreferenceSchema,
      clock: (item) => ({
        scope: "actor",
        id: `${session.id}:${item.id}`,
        revision: item.readSequence!,
      }),
    });
    this.databaseContexts = session.register({
      name: "database-context-facets",
      schema: z
        .object({
          id: z.string().min(1),
          readSequence: z.number().int().nonnegative(),
          context: z.record(z.string(), z.unknown()),
        })
        .strict(),
      partialObjects: ["context"],
      clock: (item) => ({
        scope: "actor",
        id: `${session.id}:${item.id}`,
        revision: item.readSequence!,
      }),
    });
    // Placement reads have no storage revision. Order only reads in this
    // authorization session, never host clocks from unrelated databases.
    this.placements = session.register({
      name: "placements",
      schema: placementSchema,
      clock: (item) => ({
        scope: "actor",
        id: `${session.id}:${item.id}`,
        revision: item.readSequence!,
      }),
    });
    this.databasePreferences = session.register({
      name: "database-preferences",
      schema: preferenceSchema,
      clock: (item) => ({
        scope: "actor",
        id: `${item.actorId}:${item.id}`,
        revision: item.revision!,
      }),
    });
  }
}

export type PlacementReference = { id: string; cacheId: string };
export type NavigationDatabaseReference = {
  id: string;
  cacheId: string;
  databaseVersion: number;
  primarySourceId: string | null;
  sourceIds: string[];
  viewIds: string[];
  context: Partial<
    Omit<
      PageDatabase,
      | "id"
      | "name"
      | "config"
      | "views"
      | "dataSources"
      | "dataSourceConfig"
      | "metadataState"
      | "actorState"
      | "isFavorite"
    >
  >;
};

export function normalizeNavigationReference(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  workspaceId: string,
  payload: PageNavigationPayload,
): PageNavigationReference {
  const { entities, inputs, references } = prepareAuthorizedPages(
    client,
    read,
    workspaceId,
    payload.pages,
  );
  const databaseReads = payload.databases.map((database) => {
    if (database.workspaceId !== workspaceId || !database.metadataState)
      throw new Error("Navigation database scope or clock missing");
    const {
      id,
      name,
      config,
      dataSourceConfig: _sourceConfig,
      metadataState,
      views,
      actorState,
      isFavorite: _favorite,
      dataSources,
      workspaceId: _workspaceId,
      pageId,
      createdAt,
      updatedAt,
      deletedAt,
      createdById,
      deletedById,
      teamspaceId,
      ...context
    } = database;
    if (!dataSources) throw new Error("Navigation sources require an authorized read");
    const prepared = entities.databases.prepareBootstrap(
      id,
      {
        database: {
          id,
          name,
          config,
          workspaceId,
          pageId,
          createdAt,
          updatedAt,
          deletedAt: deletedAt ?? null,
          version: metadataState.version,
          accessLevel: null,
        },
        dataSources,
        views,
        properties: [],
      },
      { createdById, deletedById, teamspaceId },
    );
    const viewer = entities.session.scope.viewer;
    if (actorState && (viewer.kind === "public" || viewer.actorId !== actorState.actorId))
      throw new Error("Navigation preference actor mismatch");
    const preference =
      actorState && entities.navigation.databasePreferences.stage([{ id, ...actorState }]);
    const facet = entities.navigation.databaseContexts.stage([
      {
        id,
        readSequence: read.sequence,
        context: Object.fromEntries(
          Object.entries(context).filter(([, value]) => value !== undefined),
        ),
      },
    ]);
    return {
      prepared,
      preference,
      facet,
      reference: {
        id,
        cacheId: entities.session.id,
        databaseVersion: metadataState.version,
        sourceIds: dataSources.map((source) => source.id),
        primarySourceId: metadataState.primarySource?.id ?? null,
        viewIds: views.map((view) => view.id),
        context: {},
      } satisfies NavigationDatabaseReference,
    };
  });
  const placements = payload.placements.map((item) => {
    if (item.workspaceId !== workspaceId) throw new Error("Navigation placement scope mismatch");
    return placementSchema.strip().parse({ ...item, readSequence: read.sequence });
  });
  // Preparing every family precedes the first collection commit.
  entities.session.ingest([
    ...inputs,
    ...databaseReads.flatMap(({ prepared, preference, facet }) => [
      ...prepared.inputs,
      facet,
      ...(preference ? [preference] : []),
    ]),
    entities.navigation.placements.stage(placements),
  ]);
  for (const { prepared } of databaseReads) prepared.authorize();
  return {
    pages: references,
    databases: databaseReads.map(({ reference }) => reference),
    placements: placements.map(({ id }) => ({ id, cacheId: entities.session.id })),
  };
}

export function resolvePlacement(
  client: QueryClient,
  reference: PlacementReference,
): PageItemPlacement | null {
  const placement = sharedClient(client)
    .get(reference.cacheId)
    ?.navigation.placements.get(reference.id);
  if (!placement) return null;
  const { readSequence: _sequence, ...item } = placementSchema.strip().parse(placement);
  return item;
}

export function resolveNavigationDatabase(
  client: QueryClient,
  reference: NavigationDatabaseReference,
): PageDatabase | null {
  const owner = sharedClient(client).get(reference.cacheId);
  const host = owner?.databases.hosts.get(reference.id);
  if (!owner || !host) return null;
  const source =
    reference.primarySourceId && owner.databases.sources.get(reference.primarySourceId);
  const favorite = owner.navigation.databasePreferences.get(reference.id);
  return {
    ...owner.navigation.databaseContexts.get(reference.id)?.context,
    ...reference.context,
    ...hostCacheEntitySchema.strip().parse(host),
    dataSourceConfig: source ? sourceCacheEntitySchema.strip().parse(source).config : null,
    metadataState: {
      version: host.version,
      primarySource: source ? { id: source.id, version: source.version } : null,
    },
    ...(favorite
      ? {
          actorState: {
            actorId: favorite.actorId,
            revision: favorite.revision,
            isFavorite: favorite.isFavorite,
          },
          isFavorite: favorite.isFavorite,
        }
      : {}),
    views: reference.viewIds.flatMap((id) => {
      const view = owner.databases.views.get(id);
      if (!view) return [];
      const { hostVersion: _version, ...item } = viewCacheEntitySchema.strip().parse(view);
      return [item];
    }),
  };
}
