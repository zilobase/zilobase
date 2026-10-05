import { type PageNavigationReference } from "../../pages/cache";
import { refreshRecordResults } from "../queries/result-refresh";
import { insertionPreviews } from "./shared-records";
import { sharedMetadataCommand, sharedMetadataPreviews } from "./shared-metadata";
import { resolveRecordWindow, type DatabaseWindowReference } from "../cache-window";
import { entityPreview, entityUpsertPreview } from "../../data/commands";
import { applyConfigurationChanges } from "./configuration";
import { reconcileBootstrapReferences, resolveDatabaseBootstrap } from "../cache-references";
import { refreshTitleMembership, refreshPropertyMembership } from "../queries/page-membership";
import { valueIdentity } from "../schema/cache-entities";
import { sharedClient } from "../../data/client";
import type { QueryClient } from "@tanstack/react-query";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { databaseRecordEntitySchema } from "../core/entities";
import { databasePropertyEntitySchema } from "../core/entities";
import { metadataEffectsForCommand } from "./metadata-command";
import { databaseCommandPolicies } from "./command-policy";
import type { DatabaseBootstrapResponse } from "../core/entities";
import { metadataNeedsProjection, projectDatabaseMetadata, type MetadataEffect } from "./metadata";
import type {
  DatabaseCommandAck,
  DatabaseRecordEntity,
  DatabaseRecordWindowResponse,
} from "../core/entities";
import {
  DatabaseCommandUnconfirmedError,
  DatabaseReconciliationError,
  OfflineError,
  executeDatabaseCommand,
  type DatabaseCommandInput,
} from "../mutations/execute";
import { DatabaseCommandState, targetsForCommand } from "../mutations/pending";
import { invalidateDatabaseQueries } from "../mutations/invalidate";
import { refreshConfirmedDatabaseReads } from "./confirmation";
import type { PageNavigationPayload } from "../../pages/contracts";
import { favoriteNeedsProjection, isNavigationSnapshot } from "./favorites";
import { navigationMetadataNeedsProjection } from "./navigation";
import {
  projectRecordInteractions,
  remapRecordIdentity,
  type RecordEffect,
  type DatabaseIntention,
} from "./model";

type Job = {
  input: DatabaseCommandInput;
  previewEffects: RecordEffect[];
  promise: Promise<DatabaseCommandAck>;
  interaction: DatabaseIntention;
  sources: string[];
  resources: string[];
  resolve: (ack: DatabaseCommandAck) => void;
  reject: (error: unknown) => void;
  release: (error: Error | null) => void;
  temporaryId?: string;
  sharedDefinitionConfirmed?: boolean;
  definitionFields?: string[];
  sharedContentConfirmed?: boolean;
  sharedPresentationConfirmed?: boolean;
  sharedResultsConfirmed?: boolean;
  contentChanges?: { pageIds: string[]; propertyIds: string[] };
  synchronizationFailed?: boolean;
  scopeExpired?: boolean;
};
type Window = { dataSourceId: string; sourceVersion: number | null };

/** Session-owned intentions. QueryClient remains an unmodified server snapshot. */
export class DatabaseController {
  readonly commandState = new DatabaseCommandState();
  private synchronizationError: Error | null = null;
  getSynchronizationError = () => this.synchronizationError;
  private reportSynchronization(cause: unknown) {
    this.synchronizationError = new DatabaseReconciliationError(cause);
    this.publish(this.snapshot);
  }
  private snapshot: readonly DatabaseIntention[] = [];
  private listeners = new Set<() => void>();
  private jobs = new Map<string, Job>();
  private windows = new Map<object, Window>();
  private bootstrapWindows = new Map<object, DatabaseBootstrapResponse>();
  private navigationWindows = new Map<object, PageNavigationPayload>();
  private identities = new Map<string, string>();
  private pageIdentities = new Map<string, string>();
  private disposed = false;
  private collecting = false;
  private unsubscribe: () => void;

  constructor(
    private queryClient: QueryClient,
    readonly sessionId: string,
    private apiFetch: ApiFetcher,
  ) {
    this.unsubscribe = queryClient.getQueryCache().subscribe(() => this.collect());
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(interactions: readonly DatabaseIntention[]) {
    this.snapshot = interactions;
    for (const listener of this.listeners) listener();
  }
  private update(interaction: DatabaseIntention) {
    this.publish(this.snapshot.map((item) => (item.id === interaction.id ? interaction : item)));
  }
  observe(key: object, window: Window) {
    this.windows.set(key, window);
    this.collect();
  }
  unobserve(key: object) {
    this.windows.delete(key);
    this.bootstrapWindows.delete(key);
    this.navigationWindows.delete(key);
    this.collect();
  }

  observeBootstrap(key: object, snapshot: DatabaseBootstrapResponse) {
    this.bootstrapWindows.set(key, snapshot);
    this.collect();
  }

  observeNavigation(key: object, snapshot: PageNavigationPayload) {
    this.navigationWindows.set(key, snapshot);
    this.collect();
  }

  bootstrap(hostId: string) {
    const snapshots = this.queryClient
      .getQueriesData({ queryKey: ["db", this.sessionId, hostId] })
      .flatMap(([, data]) => {
        const result = resolveDatabaseBootstrap(this.queryClient, data);
        return result ? [result] : [];
      })
      .sort((left, right) => right.database.version - left.database.version);
    if (snapshots[0]) return projectDatabaseMetadata(snapshots[0], this.snapshot);
    for (const [, data] of this.queryClient.getQueriesData<PageNavigationReference>({
      queryKey: ["pages"],
    })) {
      const ref = data?.databases?.find((item) => item.id === hostId && "cacheId" in item);
      const owner = ref && sharedClient(this.queryClient).get(ref.cacheId);
      const host = owner?.databases.hosts.get(hostId);
      if (ref && owner && host)
        return resolveDatabaseBootstrap(this.queryClient, {
          cacheId: owner.session.id,
          databaseId: hostId,
          databaseVersion: host.version,
          accessLevel: null,
          sourceIds: ref.sourceIds,
          bindingIds: [],
          viewIds: ref.viewIds,
          includeDeleted: false,
        });
    }
    return undefined;
  }

  execute(input: DatabaseCommandInput) {
    return this.submit(
      input,
      [],
      undefined,
      databaseCommandPolicies[input.command.type].preview === "metadata" &&
        input.command.type !== "property.update" &&
        (!sharedMetadataCommand(input) ||
          !sharedClient(this.queryClient)
            .database(input.databaseId, this.sessionId)
            ?.databases.hosts.get(input.databaseId))
        ? metadataEffectsForCommand(input, this.bootstrap(input.databaseId))
        : [],
    );
  }

  records(dataSourceId: string) {
    const windows = this.queryClient
      .getQueriesData<{ pages: DatabaseWindowReference[] }>({
        queryKey: ["db", this.sessionId],
      })
      .filter(([key]) => key[3] === "window" && key[4] === dataSourceId)
      .map(([, data]) => resolveRecordWindow(this.queryClient, data?.pages.at(-1)))
      .filter((window) => !!window)
      .sort((a, b) => a.dataSourceVersion - b.dataSourceVersion);
    const records = new Map<string, DatabaseRecordEntity>();
    for (const window of windows)
      for (const record of projectRecordInteractions(window.records, this.snapshot, {
        dataSourceId,
        sourceVersion: window.dataSourceVersion,
        resolveRecord: (id) =>
          sharedClient(this.queryClient)
            .all()
            .find((owner) => owner.databases.records.collection.has(id))
            ?.databases.resolveRecord(id),
      }))
        records.set(record.id, record);
    // Include insertions even before a destination window has loaded.
    return windows.length
      ? [...records.values()]
      : projectRecordInteractions([], this.snapshot, { dataSourceId, sourceVersion: null });
  }

  submit(
    input: DatabaseCommandInput,
    effects: RecordEffect[] = [],
    temporaryId?: string,
    metadataEffects: MetadataEffect[] = [],
  ): Promise<DatabaseCommandAck> {
    if (this.disposed) return Promise.reject(new Error("Database session ended"));
    const policy = databaseCommandPolicies[input.command.type];
    if ((policy.scope === "source") !== !!input.dataSourceId)
      return Promise.reject(new Error("Database command scope does not match its policy"));
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      return Promise.reject(new OfflineError());
    const queued = [...this.jobs.values()].at(-1);
    if (
      queued?.interaction.status === "queued" &&
      cellOnly(input) &&
      cellOnly(queued.input) &&
      input.databaseId === queued.input.databaseId &&
      input.dataSourceId === queued.input.dataSourceId &&
      input.command.rowId === queued.input.command.rowId
    ) {
      queued.input = {
        ...queued.input,
        command: {
          ...queued.input.command,
          valuesByPropertyId: {
            ...queued.input.command.valuesByPropertyId,
            ...input.command.valuesByPropertyId,
          },
        },
      };
      for (const effect of effects) {
        const previous = queued.previewEffects.find((item) => item.rowId === effect.rowId);
        if (previous) previous.values = { ...previous.values, ...effect.values };
        else queued.previewEffects.push(effect);
      }
      const targets = targetsForCommand(input);
      this.commandState.begin(targets);
      const release = queued.release;
      queued.release = (error) => {
        release(error);
        this.commandState.end(targets, error);
      };
      return queued.promise;
    }
    const id = crypto.randomUUID();
    if (
      (input.command.type === "row.change" || input.command.type === "row.place") &&
      input.command.clearSortViewId
    )
      metadataEffects = [
        ...metadataEffects,
        {
          hostId: input.databaseId,
          kind: "view",
          id: input.command.clearSortViewId,
          configuration: [{ operation: "set", path: ["sorts"], value: [] }],
        },
      ];
    if (input.command.type === "database.create") input = { ...input, databaseId: id };
    const interaction: DatabaseIntention = {
      id,
      effects: effects.map((effect) => {
        const owner = sharedClient(this.queryClient).database(input.databaseId, this.sessionId);
        if (!owner?.databases.pageForRecord(input.databaseId, effect.rowId)) return effect;
        const {
          values: _values,
          title: _title,
          parentRowId: _parent,
          record: _record,
          ...placement
        } = effect;
        return placement;
      }),
      metadataEffects,
      status: "queued",
      ...(input.command.type === "database.favorite" &&
      !sharedClient(this.queryClient)
        .database(input.databaseId, this.sessionId)
        ?.navigation.databasePreferences.get(input.databaseId)
        ? { favorite: { hostId: input.databaseId, value: input.command.favorite } }
        : {}),
    };
    const sources = [
      ...new Set([
        ...(input.dataSourceId ? [input.dataSourceId] : []),
        ...effects.map(({ dataSourceId }) => dataSourceId),
      ]),
    ].sort();
    const resources = new Set([
      `host:${input.databaseId}`,
      ...sources.map((source) => `source:${source}`),
    ]);
    if (!input.dataSourceId)
      for (const source of this.bootstrap(input.databaseId)?.dataSources ?? [])
        resources.add(`source:${source.id}`);
    if ("dataSourceId" in input.command) resources.add(`source:${input.command.dataSourceId}`);
    if (input.command.type === "row.place" && input.command.source)
      resources.add(`host:${input.command.source.databaseId}`);
    const targets = targetsForCommand(input);
    this.commandState.begin(targets);
    const releaseCache = sharedClient(this.queryClient)
      .database(input.databaseId, this.sessionId)
      ?.session.retain();
    let accept!: (ack: DatabaseCommandAck) => void;
    let fail!: (error: unknown) => void;
    const promise = new Promise<DatabaseCommandAck>((resolve, reject) => {
      accept = resolve;
      fail = reject;
    });
    this.jobs.set(id, {
      input,
      previewEffects: effects,
      promise,
      interaction,
      sources,
      resources: [...resources].sort(),
      resolve: accept,
      reject: fail,
      temporaryId,
      release: (error) => {
        releaseCache?.();
        this.commandState.end(targets, error);
      },
    });
    this.publish([...this.snapshot, interaction]);
    this.pump();
    return promise;
  }

  retryUnconfirmed() {
    for (const job of this.jobs.values()) {
      if (job.interaction.status !== "unconfirmed") continue;
      job.interaction = { ...job.interaction, status: "queued" };
      this.update(job.interaction);
    }
    this.pump();
  }
  private pump() {
    if (this.disposed) return;
    const blocked = new Map<string, boolean>();
    for (const job of this.jobs.values()) {
      const exclusive = (resource: string) =>
        !resource.startsWith("host:") ||
        !job.input.dataSourceId ||
        ("clearSortViewId" in job.input.command && !!job.input.command.clearSortViewId);
      const canStart =
        job.interaction.status === "queued" &&
        !job.resources.some(
          (resource) => blocked.has(resource) && (blocked.get(resource) || exclusive(resource)),
        );
      for (const resource of job.resources)
        blocked.set(resource, (blocked.get(resource) ?? false) || exclusive(resource));
      if (canStart) {
        job.interaction = { ...job.interaction, status: "saving" };
        this.update(job.interaction);
        void this.save(job);
      }
    }
  }
  private remapReferences<T>(value: T): T {
    if (typeof value === "string")
      return (this.identities.get(value) ?? this.pageIdentities.get(value) ?? value) as T;
    if (Array.isArray(value)) return value.map((item) => this.remapReferences(item)) as T;
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          this.identities.get(key) ?? key,
          this.remapReferences(item),
        ]),
      ) as T;
    return value;
  }
  private async save(job: Job) {
    // Freeze the remapped request before first delivery; retries use exactly this ID/body.
    job.input = this.remapReferences(job.input);
    job.previewEffects = this.remapReferences(job.previewEffects);
    try {
      const owner = sharedClient(this.queryClient);
      const entities = owner.database(job.input.databaseId, this.sessionId);
      const authorization = owner.capture();
      const send = async () => {
        const ack = await executeDatabaseCommand(this.apiFetch, job.input, {
          commandId: job.interaction.id,
        });
        job.scopeExpired = !owner.isCurrent(authorization);
        if (ack.event && entities && !job.scopeExpired) {
          try {
            const definition = entities.databases.isDefinitionEvent(ack.event);
            const content = entities.databases.isRecordContentEvent(ack.event);
            const presentation = entities.databases.isPresentationEvent(ack.event);
            const results = entities.databases.isRecordResultEvent(ack.event);
            job.contentChanges = entities.databases.contentChanges(ack.event);
            job.definitionFields = entities.databases.definitionChanges(ack.event);
            const contiguous = entities.databases.observeDelivery(
              ack.event.databaseId,
              ack.event.version,
            );
            const admitted = entities.session.batch(() => {
              const result = entities.databases.ingestEvent(ack.event);
              if (result === "published")
                reconcileBootstrapReferences(this.queryClient, ack.event!, entities.session.id);
              return result;
            });
            job.sharedDefinitionConfirmed = contiguous && definition && admitted === "published";
            job.sharedContentConfirmed = contiguous && content && admitted === "published";
            job.sharedPresentationConfirmed =
              contiguous && presentation && admitted === "published";
            job.sharedResultsConfirmed = contiguous && results && admitted === "published";
          } catch (error) {
            job.synchronizationFailed = true;
            this.reportSynchronization(error);
          }
        }
        if (
          ack.privateConfirmation &&
          entities &&
          !job.scopeExpired &&
          job.input.command.type === "database.favorite"
        ) {
          const viewer = entities.session.scope.viewer;
          if (viewer.kind === "public" || viewer.actorId !== ack.privateConfirmation.actorId)
            throw new DatabaseCommandUnconfirmedError(
              new Error("Preference confirmation actor mismatch"),
            );
          try {
            entities.session.ingest([
              entities.navigation.databasePreferences.stage([
                {
                  id: job.input.databaseId,
                  actorId: ack.privateConfirmation.actorId,
                  revision: ack.privateConfirmation.revision,
                  isFavorite: job.input.command.favorite,
                },
              ]),
            ]);
            job.sharedPresentationConfirmed = true;
          } catch (error) {
            job.synchronizationFailed = true;
            this.reportSynchronization(error);
          }
        }
        return ack;
      };
      const title = job.input.command.type === "row.change" ? job.input.command.title : undefined;
      const record =
        job.input.command.type === "row.change" && entities
          ? entities.databases.records.get(job.input.command.rowId)
          : undefined;
      const previews =
        entities && sharedMetadataCommand(job.input)
          ? sharedMetadataPreviews(entities, job.input, this.bootstrap(job.input.databaseId))
          : [];
      if (entities) previews.push(...insertionPreviews(entities, job.previewEffects));
      if (
        entities &&
        job.input.command.type === "database.favorite" &&
        entities.navigation.databasePreferences.get(job.input.databaseId)
      ) {
        const favorite = job.input.command.favorite;
        previews.push(
          entityPreview(entities.navigation.databasePreferences, job.input.databaseId, (draft) => {
            draft.isFavorite = favorite;
          }),
        );
      }
      if (entities && record && title !== undefined)
        previews.push(
          entityPreview(entities.pages, record.pageId, (draft) => {
            draft.name = title;
          }),
        );
      if (entities && job.input.command.type === "row.change") {
        for (const effect of job.previewEffects) {
          const row = entities.databases.records.get(effect.rowId);
          const pageId = entities.databases.pageForRecord(job.input.databaseId, effect.rowId);
          if (!pageId) continue;
          if (row && effect.parentRowId !== undefined)
            previews.push(
              entityPreview(entities.databases.records, row.id, (draft) => {
                draft.parentRowId = effect.parentRowId!;
              }),
            );
          for (const [propertyId, value] of Object.entries(effect.values ?? {})) {
            const id = valueIdentity(pageId, propertyId);
            const existing = entities.databases.values.get(id);
            previews.push(
              entityUpsertPreview(
                entities.databases.values,
                {
                  ...existing,
                  id,
                  pageId,
                  propertyId,
                  value,
                  valueId: existing?.valueId ?? `draft:${id}`,
                  createdAt: existing?.createdAt ?? row?.updatedAt ?? new Date().toISOString(),
                  updatedAt: existing?.updatedAt ?? row?.updatedAt ?? new Date().toISOString(),
                },
                (draft) => {
                  draft.value = value;
                },
              ),
            );
          }
        }
      }
      const command = job.input.command;
      if (entities && command.type === "property.update") {
        const binding = entities.databases.bindings.get(command.propertyId);
        const definition = binding && entities.databases.definitions.get(binding.propertyId);
        if (binding && definition) {
          previews.push(
            entityPreview(entities.databases.definitions, definition.id, (draft) => {
              if (command.patch.name !== undefined) draft.name = command.patch.name;
              // Type conversion can transform values; publish that at confirmation.
              if (command.patch.configuration)
                draft.config = applyConfigurationChanges(draft.config, command.patch.configuration);
            }),
          );
          previews.push(
            entityPreview(entities.databases.bindings, binding.id, (draft) => {
              if (command.patch.visible !== undefined) draft.visible = command.patch.visible;
              if (command.patch.width !== undefined) draft.width = command.patch.width;
            }),
          );
        }
      }
      const ack =
        entities && previews.length
          ? await entities.session.commands.runMany(previews, send)
          : await send();
      if (this.disposed) return;
      for (const source of job.sources)
        if (ack.sourceVersions[source] === undefined)
          throw new DatabaseCommandUnconfirmedError(new Error("Missing source confirmation"));
      const createdProperty = job.interaction.metadataEffects?.find(
        (effect) => effect.kind === "property" && effect.insert,
      );
      if (createdProperty?.insert && "propertyId" in createdProperty.insert) {
        const parsed = databasePropertyEntitySchema.safeParse(ack.result);
        if (!parsed.success) throw new DatabaseCommandUnconfirmedError(parsed.error);
        this.identities.set(createdProperty.id, parsed.data.id);
        this.identities.set(createdProperty.insert.propertyId, parsed.data.propertyId);
        const remap = (interaction: DatabaseIntention) => {
          const next = this.remapReferences(interaction);
          return {
            ...next,
            metadataEffects: next.metadataEffects?.map((effect) =>
              effect.insert?.id === parsed.data.id ? { ...effect, insert: parsed.data } : effect,
            ),
          };
        };
        this.publish(this.snapshot.map(remap));
        for (const queued of this.jobs.values()) queued.interaction = remap(queued.interaction);
      }
      if (job.temporaryId) {
        const parsed = databaseRecordEntitySchema.safeParse(ack.result);
        if (!parsed.success) throw new DatabaseCommandUnconfirmedError(parsed.error);
        const record = parsed.data;
        const temporaryPageId = job.interaction.effects.find(
          ({ rowId }) => rowId === job.temporaryId,
        )?.record?.pageId;
        if (temporaryPageId) this.pageIdentities.set(temporaryPageId, record.pageId);
        this.identities.set(job.temporaryId, record.id);
        this.publish(
          this.snapshot.map((item) =>
            remapRecordIdentity(item, job.temporaryId!, record, temporaryPageId),
          ),
        );
        for (const queued of this.jobs.values())
          queued.interaction = remapRecordIdentity(
            queued.interaction,
            job.temporaryId,
            record,
            temporaryPageId,
          );
      }
      job.interaction = {
        ...job.interaction,
        status: "committed",
        ...(job.scopeExpired ? { effects: [], metadataEffects: [], favorite: undefined } : {}),
        ...(job.interaction.favorite && ack.privateConfirmation
          ? {
              favorite: { ...job.interaction.favorite, confirmation: ack.privateConfirmation },
            }
          : {}),
        sourceVersions:
          (titleOnly(job.input) && entities) ||
          job.sharedDefinitionConfirmed ||
          job.sharedPresentationConfirmed ||
          job.sharedContentConfirmed ||
          job.synchronizationFailed
            ? {}
            : ack.sourceVersions,
        ...((titleOnly(job.input) && entities) ||
        job.sharedContentConfirmed ||
        job.synchronizationFailed
          ? { effects: [] }
          : {}),
        hostVersions: ack.event ? { [ack.event.databaseId]: ack.event.version } : {},
      };
      this.update(job.interaction);
      this.jobs.delete(job.interaction.id);
      job.release(null);
      job.resolve(ack);
      this.refresh(job, ack);
      this.collect();
      this.pump();
    } catch (cause) {
      if (this.disposed) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if (error instanceof DatabaseCommandUnconfirmedError) {
        job.interaction = { ...job.interaction, status: "unconfirmed" };
        this.update(job.interaction);
        this.commandState.report(targetsForCommand(job.input), error);
      } else {
        this.jobs.delete(job.interaction.id);
        this.publish(this.snapshot.filter(({ id }) => id !== job.interaction.id));
        job.release(error);
        // Cancel the entire dependency chain, including newly created schema identities.
        const createdIds = (candidate: Job) => [
          ...(candidate.temporaryId ? [candidate.temporaryId] : []),
          ...(candidate.interaction.metadataEffects ?? []).flatMap((effect) =>
            effect.insert
              ? [effect.id, ...("propertyId" in effect.insert ? [effect.insert.propertyId] : [])]
              : [],
          ),
        ];
        const failedIds = new Set(createdIds(job));
        const referencesFailed = (value: unknown): boolean => {
          if (typeof value === "string") return failedIds.has(value);
          if (Array.isArray(value)) return value.some(referencesFailed);
          return (
            !!value &&
            typeof value === "object" &&
            Object.entries(value).some(
              ([key, item]) => failedIds.has(key) || referencesFailed(item),
            )
          );
        };
        for (const dependent of this.jobs.values()) {
          if (!referencesFailed(dependent.input.command)) continue;
          for (const id of createdIds(dependent)) failedIds.add(id);
          this.jobs.delete(dependent.interaction.id);
          this.publish(this.snapshot.filter(({ id }) => id !== dependent.interaction.id));
          dependent.release(error);
          dependent.reject(error);
        }
        this.pump();
      }
      job.reject(error);
      this.refresh(job);
    }
  }
  private refresh(job: Job, ack?: DatabaseCommandAck) {
    if (job.scopeExpired) return;
    if (ack && job.sharedContentConfirmed) {
      refreshTitleMembership(this.queryClient, job.contentChanges?.pageIds ?? []);
      refreshPropertyMembership(this.queryClient, job.contentChanges?.propertyIds ?? []);
      return;
    }
    if (ack && job.sharedResultsConfirmed) {
      const owner = sharedClient(this.queryClient).database(job.input.databaseId, this.sessionId);
      if (owner) refreshRecordResults(this.queryClient, owner.session.id, ack.sourceVersions);
      return;
    }
    if (ack && job.sharedDefinitionConfirmed) {
      refreshPropertyMembership(this.queryClient, job.definitionFields ?? [], {
        definitionsChanged: true,
      });
      return;
    }
    if (ack && job.sharedPresentationConfirmed) return;
    if (ack && titleOnly(job.input)) {
      refreshTitleMembership(
        this.queryClient,
        ack.event?.changes.records?.map((record) => record.pageId) ?? [],
      );
      return;
    }

    const hosts = new Set([job.input.databaseId]);
    const sources = new Set([...job.sources, ...Object.keys(ack?.sourceVersions ?? {})]);
    if (job.input.command.type === "row.place" && job.input.command.source)
      hosts.add(job.input.command.source.databaseId);
    for (const query of this.queryClient
      .getQueryCache()
      .findAll({ queryKey: ["db", this.sessionId] })) {
      if (query.queryKey[3] === "window" && sources.has(String(query.queryKey[4])))
        hosts.add(String(query.queryKey[2]));
      const bootstrap = resolveDatabaseBootstrap(this.queryClient, query.state.data);
      if (bootstrap && bootstrap.dataSources.some(({ id }) => sources.has(id)))
        hosts.add(bootstrap.database.id);
    }
    if (ack)
      void refreshConfirmedDatabaseReads(
        this.queryClient,
        this.sessionId,
        job.input,
        ack,
        hosts,
      ).catch((cause) => {
        if (!this.disposed) this.reportSynchronization(cause);
      });
    for (const host of hosts) {
      const recoveryReads = this.queryClient
        .getQueryCache()
        .findAll({ queryKey: ["db", this.sessionId, host] })
        .filter((query) => query.isActive())
        .map((query) => ({ query, before: query.state.dataUpdatedAt }));
      invalidateDatabaseQueries(this.queryClient, this.sessionId, host);
      // React Query normally swallows refetch failures. Explicitly surface them,
      // without rejecting the already acknowledged write or dropping its preview.
      void this.queryClient
        .refetchQueries(
          { queryKey: ["db", this.sessionId, host], type: "active" },
          { throwOnError: true, cancelRefetch: false },
        )
        .then(() => {
          if (
            !this.disposed &&
            this.synchronizationError &&
            recoveryReads.length > 0 &&
            recoveryReads.every(
              ({ query, before }) =>
                query.state.status === "success" && query.state.dataUpdatedAt > before,
            )
          ) {
            this.synchronizationError = null;
            this.publish(this.snapshot);
          }
        })
        .catch((cause) => {
          if (!this.disposed) this.reportSynchronization(cause);
        });
    }
  }
  private collect() {
    if (
      this.disposed ||
      this.collecting ||
      !this.snapshot.some(({ status }) => status === "committed")
    )
      return;
    this.collecting = true;
    try {
      const queries = this.queryClient
        .getQueryCache()
        .findAll({ queryKey: ["db", this.sessionId] });
      const keep = this.snapshot.filter((interaction) => {
        if (interaction.status !== "committed") return true;
        let stale = false;
        if (interaction.favorite) {
          for (const snapshot of this.navigationWindows.values())
            if (favoriteNeedsProjection(interaction.favorite, snapshot)) stale = true;
          for (const query of this.queryClient.getQueryCache().findAll({ queryKey: ["pages"] })) {
            if (
              query.queryKey[2] !== "nav" ||
              !isNavigationSnapshot(query.state.data) ||
              !favoriteNeedsProjection(interaction.favorite, query.state.data)
            )
              continue;
            if (!query.isActive() && query.state.fetchStatus === "idle")
              this.queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
            else stale = true;
          }
        }
        for (const effect of interaction.metadataEffects ?? []) {
          for (const snapshot of this.navigationWindows.values())
            if (navigationMetadataNeedsProjection(effect, interaction, snapshot)) stale = true;
          for (const query of this.queryClient.getQueryCache().findAll({ queryKey: ["pages"] })) {
            if (
              query.queryKey[2] !== "nav" ||
              !isNavigationSnapshot(query.state.data) ||
              !navigationMetadataNeedsProjection(effect, interaction, query.state.data)
            )
              continue;
            if (!query.isActive() && query.state.fetchStatus === "idle")
              this.queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
            else stale = true;
          }
          for (const snapshot of this.bootstrapWindows.values())
            if (metadataNeedsProjection(effect, interaction, snapshot)) stale = true;
          for (const query of queries) {
            const parsed = resolveDatabaseBootstrap(this.queryClient, query.state.data);
            if (!parsed || !metadataNeedsProjection(effect, interaction, parsed)) continue;
            if (!query.isActive() && query.state.fetchStatus === "idle")
              this.queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
            else stale = true;
          }
        }
        for (const [source, version] of Object.entries(interaction.sourceVersions ?? {})) {
          for (const window of this.windows.values())
            if (
              window.dataSourceId === source &&
              (window.sourceVersion === null || window.sourceVersion < version)
            )
              stale = true;
          for (const query of queries) {
            if (query.queryKey[3] !== "window" || query.queryKey[4] !== source) continue;
            const data = query.state.data as { pages?: DatabaseRecordWindowResponse[] } | undefined;
            if ((data?.pages?.at(-1)?.dataSourceVersion ?? -1) >= version) continue;
            if (!query.isActive() && query.state.fetchStatus === "idle")
              this.queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
            else stale = true;
          }
        }
        return stale;
      });
      if (keep.length !== this.snapshot.length) this.publish(keep);
    } finally {
      this.collecting = false;
    }
  }
  dispose() {
    this.disposed = true;
    this.unsubscribe();
    for (const job of this.jobs.values()) {
      job.release(null);
      job.reject(new Error("Database session ended"));
    }
    this.jobs.clear();
    this.windows.clear();
    this.bootstrapWindows.clear();
    this.navigationWindows.clear();
    this.identities.clear();
    this.pageIdentities.clear();
    this.commandState.clear();
    this.publish([]);
  }
}

const sessions = new WeakMap<QueryClient, Map<string, DatabaseController>>();
const owners = new WeakMap<DatabaseController, { count: number }>();

/** Deferred disposal tolerates StrictMode's setup/cleanup/setup cycle. */
export function retainDatabaseController(
  queryClient: QueryClient,
  sessionId: string,
  apiFetch: ApiFetcher,
) {
  const controller = databaseController(queryClient, sessionId, apiFetch);
  const owner = owners.get(controller) ?? { count: 0 };
  owners.set(controller, owner);
  owner.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owner.count--;
    queueMicrotask(() => {
      if (owner.count || sessions.get(queryClient)?.get(sessionId) !== controller) return;
      disposeDatabaseController(queryClient, sessionId);
      queryClient.removeQueries({ queryKey: ["db", sessionId] });
    });
  };
}
export function databaseController(
  queryClient: QueryClient,
  sessionId: string,
  apiFetch: ApiFetcher,
) {
  let stores = sessions.get(queryClient);
  if (!stores) {
    stores = new Map();
    sessions.set(queryClient, stores);
  }
  let store = stores.get(sessionId);
  if (!store) {
    store = new DatabaseController(queryClient, sessionId, apiFetch);
    stores.set(sessionId, store);
  }
  return store;
}
export function disposeDatabaseController(queryClient: QueryClient, sessionId: string) {
  sessions.get(queryClient)?.get(sessionId)?.dispose();
  sessions.get(queryClient)?.delete(sessionId);
}

function titleOnly(input: DatabaseCommandInput) {
  return (
    input.command.type === "row.change" &&
    input.command.title !== undefined &&
    input.command.valuesByPropertyId === undefined &&
    input.command.placement === undefined &&
    input.command.hierarchy === undefined &&
    !input.command.clearSortViewId
  );
}

function cellOnly(input: DatabaseCommandInput): input is DatabaseCommandInput & {
  command: Extract<import("../core/entities").DatabaseCommand, { type: "row.change" }>;
} {
  const command = input.command;
  return (
    command.type === "row.change" &&
    command.valuesByPropertyId !== undefined &&
    command.title === undefined &&
    command.placement === undefined &&
    command.hierarchy === undefined &&
    !command.clearSortViewId
  );
}
