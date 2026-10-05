import { parseDatabaseOrderKey } from "./core/order-key";
import type { DataSession } from "../data/session";
import type { EntityCollection, PreparedIngestion } from "../data/collection";
import { entityTimestamp } from "../data/clock";
import { pageCacheEntitySchema, type PageCacheEntity } from "../pages/cache-entities";
import {
  databaseBootstrapResponseSchema,
  databaseRecordEntitySchema,
  databaseRecordWindowResponseSchema,
  databaseMutationEventV2Schema,
  type DatabasePropertyEntity,
  type DatabaseRecordEntity,
} from "./core/entities";
import {
  hostCacheEntitySchema,
  sourceCacheEntitySchema,
  sourceLinkCacheEntitySchema,
  propertyCacheEntitySchema,
  bindingCacheEntitySchema,
  valueCacheEntitySchema,
  recordCacheEntitySchema,
  viewCacheEntitySchema,
  valueIdentity,
  sourceLinkIdentity,
} from "./schema/cache-entities";

/** Read memberships remain in Query; only canonical entities enter collections. */
export class DatabaseCollections {
  readonly hosts;
  readonly sources;
  readonly links;
  readonly definitions;
  readonly bindings;
  readonly values;
  readonly records;
  readonly views;
  private readonly pageInterests = new Map<
    string,
    Map<string, { pageId: string; dataSourceId: string; propertyIds: Set<string> }>
  >();
  admitPageProperties(
    pageId: string,
    targets: readonly {
      databaseId: string;
      dataSourceId: string;
      rowId: string;
      propertyIds: string[];
    }[],
  ) {
    for (const target of targets) {
      const rows = this.pageInterests.get(target.databaseId) ?? new Map();
      rows.set(target.rowId, {
        pageId,
        dataSourceId: target.dataSourceId,
        propertyIds: new Set(target.propertyIds),
      });
      this.pageInterests.set(target.databaseId, rows);
    }
  }
  hasHostInterest(id: string) {
    return this.hosts.collection.base.has(id) || this.pageInterests.has(id);
  }
  pageForRecord(hostId: string, rowId: string) {
    return this.records.get(rowId)?.pageId ?? this.pageInterests.get(hostId)?.get(rowId)?.pageId;
  }
  private readonly delivery = new Map<string, { version: number; seen: Set<number> }>();

  observeDelivery(databaseId: string, version: number) {
    const state = this.delivery.get(databaseId);
    if (!state) return false;
    if (version <= state.version) return true;
    state.seen.add(version);
    while (state.seen.delete(state.version + 1)) state.version++;
    return version <= state.version;
  }

  private readonly authorizedSources = new Map<string, Set<string>>();

  constructor(
    readonly session: DataSession,
    readonly pages: EntityCollection<PageCacheEntity>,
  ) {
    this.hosts = session.register({
      name: "database-hosts",
      schema: hostCacheEntitySchema,
      clock: (host) => ({ scope: "host", id: host.id, revision: host.version! }),
    });
    this.sources = session.register({
      name: "sources",
      schema: sourceCacheEntitySchema,
      clock: (source) => ({ scope: "source", id: source.id, revision: source.version! }),
    });
    this.links = session.register({
      name: "source-links",
      schema: sourceLinkCacheEntitySchema,
      clock: (link) => ({ scope: "host", id: link.databaseId!, revision: link.hostVersion! }),
    });
    this.definitions = session.register({
      name: "property-definitions",
      schema: propertyCacheEntitySchema,
      clock: (definition) => entityTimestamp(definition.id, definition.updatedAt!),
    });
    this.bindings = session.register({
      name: "property-bindings",
      schema: bindingCacheEntitySchema,
      clock: (binding) => entityTimestamp(binding.id, binding.updatedAt!),
    });
    this.values = session.register({
      name: "property-values",
      schema: valueCacheEntitySchema,
      clock: (value) => entityTimestamp(value.id, value.updatedAt!),
    });
    this.records = session.register({
      name: "records",
      schema: recordCacheEntitySchema,
      clock: (record) => entityTimestamp(record.id, record.updatedAt!),
    });
    this.views = session.register({
      name: "views",
      schema: viewCacheEntitySchema,
      clock: (view) => ({ scope: "host", id: view.databaseId!, revision: view.hostVersion! }),
    });
  }

  releaseInactiveInterests(families: ReadonlySet<string>) {
    if (this.session.isRetained) return;
    if (!families.has("property-values") && !families.has("records")) this.pageInterests.clear();
    if (!families.has("source-links")) {
      this.authorizedSources.clear();
      this.delivery.clear();
    }
  }

  private assertWorkspace(workspaceId: string) {
    if (workspaceId !== this.session.scope.workspaceId)
      throw new Error("Cross-workspace entity input");
  }

  private stageProperties(properties: DatabasePropertyEntity[], versions: Record<string, number>) {
    const inputs: PreparedIngestion[] = [];
    for (const { property, ...binding } of properties) {
      this.assertWorkspace(property.workspaceId);
      if (property.id !== binding.propertyId)
        throw new Error("Binding definition identity mismatch");
      const sourceVersion = versions[binding.dataSourceId];
      if (sourceVersion === undefined) throw new Error("Missing binding source clock");
      inputs.push(this.definitions.stage([property]), this.bindings.stage([binding]));
    }
    return inputs;
  }

  prepareRecords(records: DatabaseRecordEntity[], versions: Record<string, number>) {
    const inputs: PreparedIngestion[] = [];
    for (const { page, valuesByPropertyId, ...record } of records) {
      if (page.id !== record.pageId) throw new Error("Record page identity mismatch");
      const sourceVersion = versions[record.dataSourceId];
      if (sourceVersion === undefined) throw new Error("Missing record source clock");
      const values = Object.entries(valuesByPropertyId).map(([propertyId, value]) => {
        if (value.pageId !== page.id || value.propertyId !== propertyId)
          throw new Error("Stored value identity mismatch");
        return { ...value, valueId: value.id, id: valueIdentity(value.pageId, value.propertyId) };
      });
      inputs.push(
        this.pages.stage([
          pageCacheEntitySchema.parse({ ...page, workspaceId: this.session.scope.workspaceId }),
        ]),
        this.values.stage(values),
        this.records.stage([{ ...record, valueIds: values.map((value) => value.id) }]),
      );
    }
    return inputs;
  }

  prepareBootstrap(
    databaseId: string,
    input: unknown,
    hostFields: {
      createdById?: string | null;
      deletedById?: string | null;
      teamspaceId?: string | null;
    } = {},
  ) {
    const { database, dataSources, properties, views } =
      databaseBootstrapResponseSchema.parse(input);
    this.assertWorkspace(database.workspaceId);
    if (database.id !== databaseId) throw new Error("Bootstrap host identity mismatch");
    const { accessLevel: _accessLevel, ...host } = database;
    const versions = Object.fromEntries(dataSources.map((source) => [source.id, source.version]));
    const inputs = [this.hosts.stage([{ ...host, ...hostFields }])];
    for (const { position, linkedAt, ...source } of dataSources) {
      this.assertWorkspace(source.workspaceId);
      inputs.push(
        this.sources.stage([source]),
        this.links.stage([
          {
            id: sourceLinkIdentity(host.id, source.id),
            databaseId: host.id,
            dataSourceId: source.id,
            position,
            linkedAt,
            hostVersion: host.version,
          },
        ]),
      );
    }
    if (
      views.some((view) => view.databaseId !== host.id || versions[view.dataSourceId] === undefined)
    )
      throw new Error("Bootstrap view scope mismatch");
    inputs.push(
      ...this.stageProperties(properties, versions),
      this.views.stage(views.map((view) => ({ ...view, hostVersion: host.version }))),
    );
    const membership = {
      databaseId: host.id,
      sourceIds: dataSources.map((source) => source.id),
      bindingIds: properties.map((property) => property.id),
      viewIds: views.map((view) => view.id),
      version: host.version,
      accessLevel: database.accessLevel,
    };
    return {
      inputs,
      membership,
      authorize: () => {
        const prior = this.delivery.get(host.id);
        if (!prior || host.version > prior.version)
          this.delivery.set(host.id, { version: host.version, seen: new Set() });
        if (this.hosts.collection.base.get(host.id)?.version === host.version)
          this.authorizedSources.set(host.id, new Set(dataSources.map((source) => source.id)));
      },
    };
  }

  ingestBootstrap(databaseId: string, input: unknown) {
    const prepared = this.prepareBootstrap(databaseId, input);
    this.session.ingest(prepared.inputs);
    prepared.authorize();
    return prepared.membership;
  }

  ingestWindow(
    databaseId: string,
    dataSourceId: string,
    expectedQueryHash: string,
    input: unknown,
  ) {
    const { records, ...result } = databaseRecordWindowResponseSchema.parse(input);
    if (result.queryHash !== expectedQueryHash)
      throw new Error("Record window query hash mismatch");
    if (
      !this.links.collection.base.has(sourceLinkIdentity(databaseId, dataSourceId)) ||
      !this.authorizedSources.get(databaseId)?.has(dataSourceId)
    )
      throw new Error("Record window requires an authorized source read");
    if (records.some((record) => record.dataSourceId !== dataSourceId))
      throw new Error("Window source mismatch");
    this.session.ingest(this.prepareRecords(records, { [dataSourceId]: result.dataSourceVersion }));
    return { ...result, recordIds: records.map((record) => record.id) };
  }

  ingestEvent(input: unknown): "published" | "authorized-read-required" {
    const event = databaseMutationEventV2Schema.parse(input);
    if (event.requiresReset) return "authorized-read-required";
    const { changes } = event;
    const sourceIds = new Set([
      ...(event.dataSourceId ? [event.dataSourceId] : []),
      ...(changes.dataSources ?? []).map((source) => source.id),
      ...(changes.properties ?? []).map((binding) => binding.dataSourceId),
      ...(changes.records ?? []).map((record) => record.dataSourceId),
      ...(changes.views ?? []).map((view) => view.dataSourceId),
    ]);
    if (
      !this.hosts.collection.base.has(event.databaseId) ||
      [...sourceIds].some((id) => !this.authorizedSources.get(event.databaseId)?.has(id))
    )
      return this.ingestPageEvent(event);
    const versions = changes.sourceVersions ?? {};
    const inputs: PreparedIngestion[] = [
      this.hosts.stage([{ id: event.databaseId, version: event.version }]),
    ];
    for (const [id, version] of Object.entries(versions)) {
      if (!this.authorizedSources.get(event.databaseId)?.has(id))
        throw new Error("Event source clock scope mismatch");
      inputs.push(this.sources.stage([{ id, version }]));
    }
    for (const { accessLevel: _accessLevel, ...host } of changes.databases ?? []) {
      if (host.id !== event.databaseId) throw new Error("Event host scope mismatch");
      this.assertWorkspace(host.workspaceId);
      inputs.push(this.hosts.stage([host]));
    }
    for (const { linkedAt, position, ...source } of changes.dataSources ?? []) {
      this.assertWorkspace(source.workspaceId);
      inputs.push(
        this.sources.stage([source]),
        this.links.stage([
          {
            id: sourceLinkIdentity(event.databaseId, source.id),
            databaseId: event.databaseId,
            dataSourceId: source.id,
            position,
            linkedAt,
            hostVersion: event.version,
          },
        ]),
      );
    }
    if ((changes.views ?? []).some((view) => view.databaseId !== event.databaseId))
      throw new Error("Event view scope mismatch");
    inputs.push(
      ...this.stageProperties(changes.properties ?? [], versions),
      ...this.prepareRecords(changes.records ?? [], versions),
      this.views.stage(
        (changes.views ?? []).map((view) => ({ ...view, hostVersion: event.version })),
      ),
    );
    for (const sourceId of changes.removedDataSourceIds ?? [])
      inputs.push(
        this.links.stageRemoval(sourceLinkIdentity(event.databaseId, sourceId), "unlink", {
          scope: "host",
          id: event.databaseId,
          revision: event.version,
        }),
      );
    for (const viewId of changes.removedViewIds ?? [])
      inputs.push(
        this.views.stageRemoval(viewId, "hard-delete", {
          scope: "host",
          id: event.databaseId,
          revision: event.version,
        }),
      );
    // Record/property exclusions are result changes, not hard deletion of pages/definitions.
    this.session.ingest(inputs);
    for (const sourceId of changes.removedDataSourceIds ?? []) {
      if (!this.links.collection.base.has(sourceLinkIdentity(event.databaseId, sourceId)))
        this.authorizedSources.get(event.databaseId)?.delete(sourceId);
    }
    return "published";
  }

  private ingestPageEvent(
    event: import("./core/entities").DatabaseMutationEventV2,
  ): "published" | "authorized-read-required" {
    const interests = this.pageInterests.get(event.databaseId);
    if (!interests) return "authorized-read-required";
    const { records = [], properties = [], sourceVersions = {}, ...other } = event.changes;
    if (
      Object.values(other).some((value) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined,
      )
    )
      return "authorized-read-required";
    // A page read proves only its rows and exposed definitions, never the rest of a source.
    if (
      records.some((record) => {
        const interest = interests.get(record.id);
        return (
          !interest ||
          interest.pageId !== record.pageId ||
          interest.dataSourceId !== record.dataSourceId ||
          Object.keys(record.valuesByPropertyId).some((id) => !interest.propertyIds.has(id))
        );
      }) ||
      properties.some(
        (binding) =>
          ![...interests.values()].some(
            (interest) =>
              interest.dataSourceId === binding.dataSourceId &&
              interest.propertyIds.has(binding.propertyId),
          ),
      )
    )
      return "authorized-read-required";
    this.session.ingest([
      ...this.prepareRecords(records, sourceVersions),
      ...this.stageProperties(properties, sourceVersions),
    ]);
    return "published";
  }

  sourcesForPages(pageIds: readonly string[]) {
    const pages = new Set(pageIds);
    const sources = new Set(
      [...this.records.collection.values()]
        .filter((record) => pages.has(record.pageId))
        .map((record) => record.dataSourceId),
    );
    for (const rows of this.pageInterests.values())
      for (const row of rows.values()) if (pages.has(row.pageId)) sources.add(row.dataSourceId);
    return [...sources];
  }

  isRecordResultEvent(event: import("./core/entities").DatabaseMutationEventV2) {
    const {
      records = [],
      removedRecordIds = [],
      views: _views,
      sourceVersions: _versions,
      ...other
    } = event.changes;
    return (
      !event.requiresReset &&
      !!(records.length || removedRecordIds.length) &&
      !Object.values(other).some((value) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined,
      )
    );
  }

  isPresentationEvent(event: import("./core/entities").DatabaseMutationEventV2) {
    const {
      databases = [],
      dataSources = [],
      views = [],
      properties = [],
      sourceVersions: _versions,
      ...other
    } = event.changes;
    if (
      event.requiresReset ||
      !(databases.length + dataSources.length + views.length + properties.length) ||
      Object.values(other).some((value) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined,
      )
    )
      return false;
    return (
      databases.every((host) => this.hosts.collection.base.has(host.id)) &&
      dataSources.every((source) => this.sources.collection.base.has(source.id)) &&
      views.every((view) => this.views.collection.base.has(view.id)) &&
      properties.every((binding) => {
        const previous = this.bindings.collection.base.get(binding.id);
        return (
          previous?.propertyId === binding.propertyId &&
          previous.dataSourceId === binding.dataSourceId &&
          !binding.property.deletedAt
        );
      })
    );
  }

  definitionChanges(event: import("./core/entities").DatabaseMutationEventV2) {
    return (event.changes.properties ?? []).flatMap((binding) => {
      const previous = this.definitions.collection.base.get(binding.propertyId);
      return ["name", "type", "config", "deletedAt"].some(
        (field) =>
          JSON.stringify(previous && Reflect.get(previous, field)) !==
          JSON.stringify(Reflect.get(binding.property, field)),
      )
        ? [binding.id, binding.propertyId]
        : [];
    });
  }

  contentChanges(event: import("./core/entities").DatabaseMutationEventV2) {
    const pageIds = new Set<string>();
    const propertyIds = new Set<string>();
    for (const record of event.changes.records ?? []) {
      if (this.pages.collection.base.get(record.pageId)?.name !== record.page.name)
        pageIds.add(record.pageId);
      for (const value of Object.values(record.valuesByPropertyId)) {
        const previous = this.values.collection.base.get(
          valueIdentity(value.pageId, value.propertyId),
        );
        if (JSON.stringify(previous?.value) !== JSON.stringify(value.value)) {
          propertyIds.add(value.propertyId);
          for (const binding of this.bindings.collection.values())
            if (binding.propertyId === value.propertyId) propertyIds.add(binding.id);
        }
      }
    }
    return { pageIds: [...pageIds], propertyIds: [...propertyIds] };
  }

  /** Value/title edits preserve identity, placement and lifecycle membership. */
  isRecordContentEvent(event: import("./core/entities").DatabaseMutationEventV2) {
    const { records, sourceVersions: _versions, ...other } = event.changes;
    if (
      event.requiresReset ||
      !records?.length ||
      Object.values(other).some((value) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined,
      )
    )
      return false;
    return records.every((record) => {
      const current = this.records.collection.base.get(record.id);
      const page = this.pages.collection.base.get(record.pageId);
      if (!current) {
        const interest = this.pageInterests.get(event.databaseId)?.get(record.id);
        return (
          interest?.pageId === record.pageId &&
          interest.dataSourceId === record.dataSourceId &&
          !record.page.deletedAt
        );
      }
      return (
        current &&
        page &&
        current.pageId === record.pageId &&
        current.dataSourceId === record.dataSourceId &&
        parseDatabaseOrderKey(current.orderKey) === parseDatabaseOrderKey(record.orderKey) &&
        current.parentRowId === record.parentRowId &&
        page.deletedAt === record.page.deletedAt
      );
    });
  }

  resolveRecord(id: string): DatabaseRecordEntity | undefined {
    const record = this.records.get(id);
    const page = record && this.pages.get(record.pageId);
    if (!record || !page) return undefined;
    const { valueIds, ...fields } = recordCacheEntitySchema.strip().parse(record);
    const keys = new Set([
      ...valueIds,
      ...[...this.bindings.collection.values()]
        .filter((binding) => binding.dataSourceId === record.dataSourceId)
        .map((binding) => valueIdentity(record.pageId, binding.propertyId)),
    ]);
    const valuesByPropertyId = Object.fromEntries(
      [...keys].flatMap((key) => {
        const value = this.values.get(key);
        if (!value) return [];
        const { valueId, ...fields } = valueCacheEntitySchema.strip().parse(value);
        return [[value.propertyId, { ...fields, id: valueId }]];
      }),
    );
    return databaseRecordEntitySchema.parse({
      ...fields,
      valuesByPropertyId,
      page: {
        id: page.id,
        name: page.name,
        metadata: page.metadata,
        hasContent: page.hasContent ?? false,
        deletedAt: page.deletedAt ?? null,
        createdAt: page.createdAt ?? page.updatedAt,
        updatedAt: page.updatedAt,
      },
    });
  }

  isDefinitionEvent(event: import("./core/entities").DatabaseMutationEventV2) {
    const { properties, sourceVersions: _versions, ...other } = event.changes;
    if (
      event.requiresReset ||
      !properties?.length ||
      Object.values(other).some((value) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined,
      )
    )
      return false;
    return properties.every((binding) => {
      const previous = this.bindings.collection.base.get(binding.id);
      return (
        previous &&
        previous.propertyId === binding.propertyId &&
        previous.dataSourceId === binding.dataSourceId &&
        previous.position === binding.position &&
        !binding.property.deletedAt
      );
    });
  }

  /** Full records can confirm page metadata without changing result membership. */
  isPageMetadataEvent(event: import("./core/entities").DatabaseMutationEventV2) {
    const { records, sourceVersions: _versions, ...other } = event.changes;
    if (
      event.requiresReset ||
      !records?.length ||
      Object.values(other).some((value) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined,
      )
    )
      return false;
    return records.every((record) => {
      const current = this.records.collection.base.get(record.id);
      const page = this.pages.collection.base.get(record.pageId);
      if (
        !current ||
        !page ||
        current.pageId !== record.pageId ||
        current.dataSourceId !== record.dataSourceId ||
        parseDatabaseOrderKey(current.orderKey) !== parseDatabaseOrderKey(record.orderKey) ||
        current.parentRowId !== record.parentRowId ||
        page.deletedAt !== record.page.deletedAt ||
        page.hasContent !== record.page.hasContent
      )
        return false;
      const values = Object.values(record.valuesByPropertyId);
      return (
        values.length === current.valueIds.length &&
        values.every((value) => {
          const previous = this.values.collection.base.get(
            valueIdentity(value.pageId, value.propertyId),
          );
          return (
            previous?.valueId === value.id &&
            previous.updatedAt === value.updatedAt &&
            JSON.stringify(previous.value) === JSON.stringify(value.value)
          );
        })
      );
    });
  }
}
