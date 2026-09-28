import type { QueryClient } from "@tanstack/react-query";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { databaseRecordEntitySchema } from "../core/entities";
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
import {
  beginPending,
  endPending,
  reportPendingError,
  targetsForCommand,
} from "../mutations/pending";
import { invalidateDatabaseQueries } from "../mutations/invalidate";
import {
  projectRecordInteractions,
  remapRecordIdentity,
  type RecordEffect,
  type RecordInteraction,
} from "./model";

type Job = {
  input: DatabaseCommandInput;
  interaction: RecordInteraction;
  sources: string[];
  resolve: (ack: DatabaseCommandAck) => void;
  reject: (error: unknown) => void;
  release: (error: Error | null) => void;
  temporaryId?: string;
};
type Window = { dataSourceId: string; sourceVersion: number | null };

/** Session-owned intentions. QueryClient remains an unmodified server snapshot. */
export class RecordInteractionStore {
  private snapshot: readonly RecordInteraction[] = [];
  private listeners = new Set<() => void>();
  private jobs = new Map<string, Job>();
  private windows = new Map<object, Window>();
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
  private publish(interactions: readonly RecordInteraction[]) {
    this.snapshot = interactions;
    for (const listener of this.listeners) listener();
  }
  private update(interaction: RecordInteraction) {
    this.publish(this.snapshot.map((item) => (item.id === interaction.id ? interaction : item)));
  }
  observe(key: object, window: Window) {
    this.windows.set(key, window);
    this.collect();
  }
  unobserve(key: object) {
    this.windows.delete(key);
    this.collect();
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
    effects: RecordEffect[],
    temporaryId?: string,
  ): Promise<DatabaseCommandAck> {
    if (this.disposed) return Promise.reject(new Error("Database session ended"));
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      return Promise.reject(new OfflineError());
    const id = crypto.randomUUID();
    const interaction: RecordInteraction = { id, effects, status: "queued" };
    const targets = targetsForCommand(input);
    beginPending(targets);
    const promise = new Promise<DatabaseCommandAck>((resolve, reject) => {
      this.jobs.set(id, {
        input,
        interaction,
        sources: [...new Set(effects.map(({ dataSourceId }) => dataSourceId))].sort(),
        resolve,
        reject,
        temporaryId,
        release: (error) => endPending(targets, error),
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
    const blocked = new Set<string>();
    for (const job of this.jobs.values()) {
      const canStart =
        job.interaction.status === "queued" && !job.sources.some((source) => blocked.has(source));
      for (const source of job.sources) blocked.add(source);
      if (canStart) {
        job.interaction = { ...job.interaction, status: "saving" };
        this.update(job.interaction);
        void this.save(job);
      }
    }
  }
  private remapInput(input: DatabaseCommandInput): DatabaseCommandInput {
    const map = (id: string | null) => (id === null ? null : (this.identities.get(id) ?? id));
    const mapValues = (values: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value.map((id) => (typeof id === "string" ? (this.pageIdentities.get(id) ?? id) : id))
            : typeof value === "string"
              ? (this.pageIdentities.get(value) ?? value)
              : value,
        ]),
      );
    const command = input.command;
    if (command.type === "row.change")
      return {
        ...input,
        command: {
          ...command,
          rowId: map(command.rowId)!,
          ...(command.valuesByPropertyId
            ? { valuesByPropertyId: mapValues(command.valuesByPropertyId) }
            : {}),
          ...(command.placement
            ? {
                placement: {
                  afterRowId: map(command.placement.afterRowId),
                  beforeRowId: map(command.placement.beforeRowId),
                },
              }
            : {}),
          ...(command.hierarchy
            ? {
                hierarchy: {
                  ...command.hierarchy,
                  parentRowId: map(command.hierarchy.parentRowId),
                },
              }
            : {}),
        },
      };
    if (command.type === "row.place")
      return {
        ...input,
        command: {
          ...command,
          ...(command.pageId
            ? { pageId: this.pageIdentities.get(command.pageId) ?? command.pageId }
            : {}),
          afterRowId: map(command.afterRowId),
          beforeRowId: map(command.beforeRowId),
          parentRowId: map(command.parentRowId),
          ...(command.valuesByPropertyId
            ? { valuesByPropertyId: mapValues(command.valuesByPropertyId) }
            : {}),
          ...(command.hierarchy
            ? {
                hierarchy: {
                  ...command.hierarchy,
                  parentRowId: map(command.hierarchy.parentRowId),
                },
              }
            : {}),
          ...(command.source
            ? { source: { ...command.source, rowId: map(command.source.rowId)! } }
            : {}),
        },
      };
    if (command.type === "row.archive" || command.type === "row.restore")
      return { ...input, command: { ...command, rowId: map(command.rowId)! } };
    return input;
  }
  private async save(job: Job) {
    // Freeze the remapped request before first delivery; retries use exactly this ID/body.
    job.input = this.remapInput(job.input);
    try {
      const ack = await executeDatabaseCommand(this.apiFetch, job.input, {
        commandId: job.interaction.id,
        trackPending: false,
      });
      if (this.disposed) return;
      for (const source of job.sources)
        if (ack.sourceVersions[source] === undefined)
          throw new DatabaseCommandUnconfirmedError(new Error("Missing source confirmation"));
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
        reportPendingError(targetsForCommand(job.input), error);
      } else {
        this.jobs.delete(job.interaction.id);
        this.publish(this.snapshot.filter(({ id }) => id !== job.interaction.id));
        job.release(error);
        // A failed insertion cannot supply identities for dependent gestures.
        if (job.temporaryId) {
          const failedIds = new Set([job.temporaryId]);
          for (const dependent of this.jobs.values()) {
            const command = dependent.input.command;
            const references =
              command.type === "row.place"
                ? [
                    command.afterRowId,
                    command.beforeRowId,
                    command.parentRowId,
                    command.hierarchy?.parentRowId,
                    command.source?.rowId,
                  ]
                : command.type === "row.change"
                  ? [
                      command.rowId,
                      command.placement?.afterRowId,
                      command.placement?.beforeRowId,
                      command.hierarchy?.parentRowId,
                    ]
                  : command.type === "row.archive" || command.type === "row.restore"
                    ? [command.rowId]
                    : [];
            if (references.some((id) => id && failedIds.has(id))) {
              if (dependent.temporaryId) failedIds.add(dependent.temporaryId);
              this.jobs.delete(dependent.interaction.id);
              this.publish(this.snapshot.filter(({ id }) => id !== dependent.interaction.id));
              dependent.release(error);
              dependent.reject(error);
            }
          }
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
            reportPendingError([{ hostDatabaseId: host }], new DatabaseReconciliationError(cause));
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
    this.identities.clear();
    this.pageIdentities.clear();
    this.publish([]);
  }
}

const sessions = new WeakMap<QueryClient, Map<string, RecordInteractionStore>>();
export function recordInteractionStore(
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
    store = new RecordInteractionStore(queryClient, sessionId, apiFetch);
    stores.set(sessionId, store);
  }
  return store;
}
export function disposeRecordInteractions(queryClient: QueryClient, sessionId: string) {
  sessions.get(queryClient)?.get(sessionId)?.dispose();
  sessions.get(queryClient)?.delete(sessionId);
}
