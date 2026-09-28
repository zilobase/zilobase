import type { QueryClient } from "@tanstack/react-query";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { databaseRecordEntitySchema, databaseBootstrapResponseSchema } from "../core/entities";
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
import {
  projectRecordInteractions,
  remapRecordIdentity,
  type RecordEffect,
  type DatabaseIntention,
} from "./model";

type Job = {
  input: DatabaseCommandInput;
  interaction: DatabaseIntention;
  sources: string[];
  resources: string[];
  resolve: (ack: DatabaseCommandAck) => void;
  reject: (error: unknown) => void;
  release: (error: Error | null) => void;
  temporaryId?: string;
};
type Window = { dataSourceId: string; sourceVersion: number | null };

/** Session-owned intentions. QueryClient remains an unmodified server snapshot. */
export class DatabaseController {
  readonly commandState = new DatabaseCommandState();
  private snapshot: readonly DatabaseIntention[] = [];
  private listeners = new Set<() => void>();
  private jobs = new Map<string, Job>();
  private windows = new Map<object, Window>();
  private bootstrapWindows = new Map<object, DatabaseBootstrapResponse>();
  private identities = new Map<string, string>();
  private pageIdentities = new Map<string, string>();
  private disposed = false;
  private collecting = false;
  private unsubscribe: () => void;

  constructor(
    private queryClient: QueryClient,
    private sessionId: string,
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
    this.collect();
  }

  observeBootstrap(key: object, snapshot: DatabaseBootstrapResponse) {
    this.bootstrapWindows.set(key, snapshot);
    this.collect();
  }

  bootstrap(hostId: string) {
    const snapshots = this.queryClient
      .getQueriesData({ queryKey: ["db", this.sessionId, hostId] })
      .flatMap(([, data]) => {
        const result = databaseBootstrapResponseSchema.safeParse(data);
        return result.success ? [result.data] : [];
      })
      .sort((left, right) => right.database.version - left.database.version);
    return snapshots[0] ? projectDatabaseMetadata(snapshots[0], this.snapshot) : undefined;
  }

  execute(input: DatabaseCommandInput) {
    return this.submit(
      input,
      [],
      undefined,
      databaseCommandPolicies[input.command.type].preview === "metadata"
        ? metadataEffectsForCommand(input, this.bootstrap(input.databaseId))
        : [],
    );
  }

  records(dataSourceId: string) {
    const windows = this.queryClient
      .getQueriesData<{ pages: DatabaseRecordWindowResponse[] }>({
        queryKey: ["db", this.sessionId],
      })
      .filter(([key]) => key[3] === "window" && key[4] === dataSourceId)
      .map(([, data]) => data?.pages.at(-1))
      .filter((window) => !!window)
      .sort((a, b) => a.dataSourceVersion - b.dataSourceVersion);
    const records = new Map<string, DatabaseRecordEntity>();
    for (const window of windows)
      for (const record of projectRecordInteractions(window.records, this.snapshot, {
        dataSourceId,
        sourceVersion: window.dataSourceVersion,
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
    const id = crypto.randomUUID();
    if (input.command.type === "database.create") input = { ...input, databaseId: id };
    const interaction: DatabaseIntention = { id, effects, metadataEffects, status: "queued" };
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
    const promise = new Promise<DatabaseCommandAck>((resolve, reject) => {
      this.jobs.set(id, {
        input,
        interaction,
        sources,
        resources: [...resources].sort(),
        resolve,
        reject,
        temporaryId,
        release: (error) => this.commandState.end(targets, error),
      });
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
        !resource.startsWith("host:") || !job.input.dataSourceId;
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
    try {
      const ack = await executeDatabaseCommand(this.apiFetch, job.input, {
        commandId: job.interaction.id,
      });
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
        sourceVersions: ack.sourceVersions,
        hostVersions: ack.event ? { [ack.event.databaseId]: ack.event.version } : {},
      };
      this.update(job.interaction);
      this.jobs.delete(job.interaction.id);
      job.release(null);
      job.resolve(ack);
      this.refresh(job);
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
  private refresh(job: Job) {
    const hosts = new Set([job.input.databaseId]);
    if (job.input.command.type === "row.place" && job.input.command.source)
      hosts.add(job.input.command.source.databaseId);
    for (const query of this.queryClient
      .getQueryCache()
      .findAll({ queryKey: ["db", this.sessionId] })) {
      if (query.queryKey[3] === "window" && job.sources.includes(String(query.queryKey[4])))
        hosts.add(String(query.queryKey[2]));
      const bootstrap = databaseBootstrapResponseSchema.safeParse(query.state.data);
      if (
        bootstrap.success &&
        bootstrap.data.dataSources.some(({ id }) => job.sources.includes(id))
      )
        hosts.add(bootstrap.data.database.id);
    }
    for (const host of hosts) {
      invalidateDatabaseQueries(this.queryClient, this.sessionId, host);
      // React Query normally swallows refetch failures. Explicitly surface them,
      // without rejecting the already acknowledged write or dropping its preview.
      void this.queryClient
        .refetchQueries(
          { queryKey: ["db", this.sessionId, host], type: "active" },
          { throwOnError: true, cancelRefetch: false },
        )
        .catch((cause) => {
          if (!this.disposed)
            this.commandState.report(
              [{ hostDatabaseId: host }],
              new DatabaseReconciliationError(cause),
            );
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
        for (const effect of interaction.metadataEffects ?? []) {
          for (const snapshot of this.bootstrapWindows.values())
            if (metadataNeedsProjection(effect, interaction, snapshot)) stale = true;
          for (const query of queries) {
            const parsed = databaseBootstrapResponseSchema.safeParse(query.state.data);
            if (!parsed.success || !metadataNeedsProjection(effect, interaction, parsed.data))
              continue;
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
    this.identities.clear();
    this.pageIdentities.clear();
    this.commandState.clear();
    this.publish([]);
  }
}

const sessions = new WeakMap<QueryClient, Map<string, DatabaseController>>();
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
