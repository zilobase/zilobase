import {
  databaseBootstrapResponseSchema,
  databaseCommandAckSchema,
  databaseCommandRequestSchema,
  databaseRecordWindowResponseSchema,
  dataSourceCommandSchema,
  hostDatabaseCommandSchema,
  type DatabaseBootstrapResponse,
  type DatabaseCommandAck,
  type DatabaseRecordEntity,
} from "@zilobase/features/databases/contracts";
import {
  projectDatabaseMetadata,
  projectRecordInteractions,
  type MetadataEffect,
} from "@zilobase/features/databases/record-interactions";
import { databaseOrderKeyAtPosition } from "@zilobase/features/databases/order-key";
import { databaseViewQueryHash } from "@zilobase/features/databases/query-hash";
import { evaluateDatabaseRecordsForView } from "@zilobase/features/databases/view-evaluation";

/** A browser-only authority for the supported demo edits, not a second UI controller. */
export class DemoDatabaseRuntime {
  private bootstraps = new Map<string, DatabaseBootstrapResponse>();
  private records = new Map<string, DatabaseRecordEntity[]>();
  private dirtyHosts = new Set<string>();
  private receipts = new Map<string, { request: string; ack: DatabaseCommandAck }>();

  constructor(private guard: () => Error) {}

  capture(url: URL, value: unknown) {
    const bootstrap = url.pathname.match(/^\/databases\/([^/]+)\/bootstrap$/);
    if (bootstrap && !this.dirtyHosts.has(decodeURIComponent(bootstrap[1]!))) {
      const parsed = databaseBootstrapResponseSchema.safeParse(value);
      if (parsed.success) {
        let snapshot = parsed.data;
        for (const source of snapshot.dataSources) {
          const local = [...this.bootstraps.values()].find(
            (candidate) =>
              this.dirtyHosts.has(candidate.database.id) &&
              candidate.dataSources.some((s) => s.id === source.id && s.version > source.version),
          );
          const confirmedSource = local?.dataSources.find((s) => s.id === source.id);
          if (!local || !confirmedSource) continue;
          snapshot = {
            ...snapshot,
            dataSources: snapshot.dataSources.map((s) =>
              s.id === source.id
                ? { ...confirmedSource, position: s.position, linkedAt: s.linkedAt }
                : s,
            ),
            properties: [
              ...snapshot.properties.filter((p) => p.dataSourceId !== source.id),
              ...local.properties.filter((p) => p.dataSourceId === source.id),
            ],
          };
        }
        if (snapshot !== parsed.data) {
          snapshot = {
            ...snapshot,
            database: { ...snapshot.database, version: snapshot.database.version + 1 },
          };
          this.dirtyHosts.add(snapshot.database.id);
        }
        this.bootstraps.set(snapshot.database.id, snapshot);
      }
    }
    const source = url.pathname.match(/^\/databases\/([^/]+)\/data-sources\/([^/]+)\/records$/);
    if (!source || this.records.has(decodeURIComponent(source[2]!))) return;
    const parsed = databaseRecordWindowResponseSchema.safeParse(value);
    // Only an entire unfiltered source can become a local authority. A partial
    // window cannot truthfully confirm filter changes or placements around hidden rows.
    if (
      parsed.success &&
      parsed.data.queryHash === databaseViewQueryHash({}) &&
      parsed.data.offset === 0 &&
      !parsed.data.hasMore &&
      parsed.data.records.length === parsed.data.totalCount
    )
      this.records.set(decodeURIComponent(source[2]!), parsed.data.records);
  }

  read(url: URL): unknown | undefined {
    const match = url.pathname.match(
      /^\/databases\/([^/]+)\/(bootstrap|data-sources\/([^/]+)\/records)$/,
    );
    if (!match) return undefined;
    const hostId = decodeURIComponent(match[1]!);
    if (!this.dirtyHosts.has(hostId)) return undefined;
    const bootstrap = this.bootstraps.get(hostId)!;
    if (match[2] === "bootstrap") return structuredClone(bootstrap);
    const sourceId = decodeURIComponent(match[3]!);
    const source = bootstrap.dataSources.find(({ id }) => id === sourceId);
    const view = bootstrap.views.find(({ id }) => id === url.searchParams.get("viewId"));
    const records = this.records.get(sourceId);
    if (
      !source ||
      !view ||
      view.dataSourceId !== sourceId ||
      url.searchParams.has("includeDeleted")
    )
      throw this.guard();
    if (!records) return undefined;
    const config = view.config ?? bootstrap.database.config;
    const queryHash = databaseViewQueryHash(config);
    if (url.searchParams.get("expectedQueryHash") !== queryHash)
      throw Object.assign(new Error("The demo view query changed"), {
        status: 409,
        body: { code: "VIEW_QUERY_CHANGED" },
      });
    const snapshot = `demo:${hostId}:${bootstrap.database.version}:${source.version}`;
    if (url.searchParams.has("snapshot") && url.searchParams.get("snapshot") !== snapshot)
      throw Object.assign(new Error("The demo window changed"), {
        status: 409,
        body: { code: "WINDOW_STALE" },
      });
    const evaluated = evaluateDatabaseRecordsForView({
      config,
      records,
      properties: bootstrap.properties.filter((p) => p.dataSourceId === sourceId),
    });
    const limit = Math.max(1, Number(url.searchParams.get("limit")) || 50);
    return databaseRecordWindowResponseSchema.parse({
      queryHash,
      databaseVersion: bootstrap.database.version,
      dataSourceVersion: source.version,
      records: evaluated.slice(0, limit),
      totalCount: evaluated.length,
      hasMore: evaluated.length > limit,
      offset: 0,
      snapshot,
    });
  }

  navigation<T>(value: T): T {
    if (
      !value ||
      typeof value !== "object" ||
      !("databases" in value) ||
      !Array.isArray(value.databases)
    )
      return value;
    return {
      ...value,
      databases: value.databases.map((database: { id: string }) => {
        const bootstrap = this.dirtyHosts.has(database.id)
          ? this.bootstraps.get(database.id)
          : undefined;
        const primarySource =
          bootstrap?.dataSources.find((source) => source.parentDatabaseId === database.id) ??
          bootstrap?.dataSources[0];
        return bootstrap
          ? {
              ...database,
              name: bootstrap.database.name,
              config: bootstrap.database.config,
              version: bootstrap.database.version,
              views: bootstrap.views,
              dataSourceConfig: primarySource?.config ?? null,
              metadataState: {
                version: bootstrap.database.version,
                primarySource: primarySource
                  ? { id: primarySource.id, version: primarySource.version }
                  : null,
              },
            }
          : database;
      }),
    };
  }

  command(url: URL, payload: unknown): DatabaseCommandAck | undefined {
    const match = url.pathname.match(
      /^\/databases\/([^/]+)\/(?:data-sources\/([^/]+)\/)?commands$/,
    );
    if (!match) return undefined;
    const parsed = databaseCommandRequestSchema.safeParse(payload);
    if (!parsed.success) throw this.guard();
    const { commandId, command } = parsed.data;
    const request = JSON.stringify([url.pathname, parsed.data]);
    const existing = this.receipts.get(commandId);
    if (existing) {
      if (existing.request !== request)
        throw Object.assign(new Error("Command ID reused"), {
          status: 409,
          body: { code: "COMMAND_ID_REUSED" },
        });
      return structuredClone(existing.ack);
    }
    const hostId = decodeURIComponent(match[1]!);
    const sourceId = match[2] ? decodeURIComponent(match[2]) : undefined;
    if (
      !(sourceId ? dataSourceCommandSchema : hostDatabaseCommandSchema).safeParse(command).success
    )
      throw this.guard();
    const base = this.bootstraps.get(hostId);
    if (!base || (sourceId && !base.dataSources.some(({ id }) => id === sourceId)))
      throw this.guard();
    const effects: MetadataEffect[] = [];
    const effect = { hostId, ...(sourceId ? { dataSourceId: sourceId } : {}) };
    const now = new Date().toISOString();
    let nextRecords: DatabaseRecordEntity[] | undefined;
    let resultId = "";
    switch (command.type) {
      case "row.change": {
        const records = this.records.get(sourceId!);
        if (!records?.some(({ id }) => id === command.rowId) || command.hierarchy)
          throw this.guard();
        if (
          Object.keys(command.valuesByPropertyId ?? {}).some(
            (propertyId) =>
              !base.properties.some(
                (p) => p.dataSourceId === sourceId && p.propertyId === propertyId,
              ),
          )
        )
          throw this.guard();
        const anchors = [command.placement?.afterRowId, command.placement?.beforeRowId].filter(
          Boolean,
        );
        if (anchors.some((id) => id === command.rowId || !records.some((row) => row.id === id)))
          throw this.guard();
        nextRecords = projectRecordInteractions(
          records,
          [
            {
              id: commandId,
              status: "queued",
              effects: [
                {
                  dataSourceId: sourceId!,
                  rowId: command.rowId,
                  title: command.title,
                  values: command.valuesByPropertyId,
                  placement: command.placement,
                },
              ],
            },
          ],
          { dataSourceId: sourceId!, sourceVersion: null },
        ).map((record, index) => ({
          ...record,
          orderKey: databaseOrderKeyAtPosition(index),
          updatedAt: now,
        }));
        resultId = command.rowId;
        if (command.clearSortViewId) {
          if (
            !base.views.some((v) => v.id === command.clearSortViewId && v.dataSourceId === sourceId)
          )
            throw this.guard();
          effects.push({
            hostId,
            kind: "view",
            id: command.clearSortViewId,
            configuration: [{ operation: "set", path: ["sorts"], value: [] }],
          });
        }
        break;
      }
      case "database.update":
      case "dataSource.update": {
        const { configuration, ...patch } = command.patch;
        if (
          command.type === "database.update" &&
          configuration &&
          base.dataSources.some((s) => !this.records.has(s.id))
        )
          throw this.guard();
        effects.push({
          ...effect,
          id: sourceId ?? hostId,
          kind: sourceId ? "source" : "database",
          patch: { ...patch, updatedAt: now },
          configuration,
        });
        break;
      }
      case "view.update": {
        const { configuration, ...patch } = command.patch;
        const view = base.views.find(({ id }) => id === command.viewId);
        if (!view || configuration?.some(({ path }) => path[0] === "subItems")) throw this.guard();
        if (
          configuration &&
          databaseViewQueryHash(view.config) !==
            databaseViewQueryHash(
              projectDatabaseMetadata(base, [
                { metadataEffects: [{ ...effect, kind: "view", id: view.id, configuration }] },
              ]).views.find(({ id }) => id === view.id)!.config,
            ) &&
          !this.records.has(view.dataSourceId)
        )
          throw this.guard();
        effects.push({
          ...effect,
          kind: "view",
          id: command.viewId,
          patch: { ...patch, updatedAt: now },
          configuration,
        });
        resultId = command.viewId;
        break;
      }
      case "property.update": {
        const column = base.properties.find(({ id }) => id === command.propertyId);
        if (
          !column ||
          column.dataSourceId !== sourceId ||
          (command.patch.type && command.patch.type !== column.property.type)
        )
          throw this.guard();
        const { configuration, visible, width, ...propertyPatch } = command.patch;
        effects.push({
          ...effect,
          kind: "property",
          id: column.id,
          propertyConfiguration: configuration,
          propertyPatch: { ...propertyPatch, updatedAt: now },
          patch: {
            ...(visible === undefined ? {} : { visible }),
            ...(width === undefined ? {} : { width }),
            updatedAt: now,
          },
        });
        resultId = column.id;
        break;
      }
      case "view.move":
      case "property.move": {
        const property = command.type === "property.move";
        const id = property ? command.propertyId : command.viewId;
        const entities = property
          ? base.properties.filter((p) => p.dataSourceId === sourceId)
          : base.views;
        const afterId = property ? command.afterPropertyId : command.afterViewId;
        const beforeId = property ? command.beforePropertyId : command.beforeViewId;
        if (
          !entities.some((entity) => entity.id === id) ||
          [afterId, beforeId].some(
            (anchor) => anchor && (anchor === id || !entities.some((e) => e.id === anchor)),
          )
        )
          throw this.guard();
        effects.push({
          ...effect,
          kind: property ? "property" : "view",
          id,
          placement: { afterId, beforeId },
        });
        resultId = id;
        break;
      }
      default:
        throw this.guard();
    }
    // All validation precedes publication; unsupported writes cannot partially edit state.
    if (sourceId && !this.records.has(sourceId)) throw this.guard();
    const sourceVersion = sourceId
      ? Math.max(
          ...[...this.bootstraps.values()].flatMap((b) =>
            b.dataSources.filter((s) => s.id === sourceId).map((s) => s.version),
          ),
        ) + 1
      : undefined;
    const updates = new Map<string, DatabaseBootstrapResponse>();
    for (const [id, snapshot] of this.bootstraps) {
      if (id !== hostId && (!sourceId || !snapshot.dataSources.some((s) => s.id === sourceId)))
        continue;
      const next = projectDatabaseMetadata(snapshot, [{ metadataEffects: effects }]);
      updates.set(
        id,
        databaseBootstrapResponseSchema.parse({
          ...next,
          database: { ...next.database, version: next.database.version + 1, updatedAt: now },
          dataSources: next.dataSources.map((s) =>
            s.id === sourceId ? { ...s, version: sourceVersion!, updatedAt: now } : s,
          ),
        }),
      );
    }
    const next = updates.get(hostId)!;
    const result =
      command.type === "row.change"
        ? nextRecords!.find(({ id }) => id === resultId)
        : command.type.startsWith("view.")
          ? next.views.find(({ id }) => id === resultId)
          : command.type.startsWith("property.")
            ? next.properties.find(({ id }) => id === resultId)
            : sourceId
              ? next.dataSources.find(({ id }) => id === sourceId)
              : next.database;
    const ack = databaseCommandAckSchema.parse({
      commandId,
      sourceVersions: sourceId ? { [sourceId]: sourceVersion } : {},
      result,
      event: {
        actorId: "demo-user",
        commandId,
        committedAt: now,
        databaseId: hostId,
        dataSourceId: sourceId ?? null,
        eventId: `demo-local-${commandId}`,
        protocolVersion: 2,
        type: "database.mutation",
        version: next.database.version,
        areas: nextRecords
          ? ["records", ...(effects.length ? ["views"] : [])]
          : effects.map(
              ({ kind }) =>
                ({
                  database: "databases",
                  source: "dataSources",
                  property: "properties",
                  view: "views",
                })[kind],
            ),
        changes: {
          databases: [next.database],
          dataSources: next.dataSources,
          properties: next.properties,
          views: next.views,
          ...(nextRecords ? { records: nextRecords } : {}),
        },
      },
    });
    for (const [id, snapshot] of updates) {
      this.bootstraps.set(id, snapshot);
      this.dirtyHosts.add(id);
    }
    if (nextRecords) this.records.set(sourceId!, nextRecords);
    this.receipts.set(commandId, { request, ack });
    return structuredClone(ack);
  }
}
