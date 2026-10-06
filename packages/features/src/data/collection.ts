import { collectionOptions, type Collection, type DbClient, type SyncConfig } from "@tanstack/db";
import { z } from "zod";

import type { DataPublication } from "./publication";
import { compareClocks, entityClockSchema, type EntityClock } from "./clock";

export type EntityRegistration<T extends { id: string }> = {
  name: string;
  schema: z.ZodType<T, T>;
  clock?: (patch: Partial<T> & { id: string }) => EntityClock;
  /** Domain-owned fields whose authorized summaries contain partial objects. */
  partialObjects?: readonly (keyof T & string)[];
};

type SyncWriter<T extends object> = Parameters<SyncConfig<T, string>["sync"]>[0];

export type PreparationContext = Map<object, Map<string, unknown>>;
export type PreparedIngestion = {
  prepare: (context?: PreparationContext) => () => void;
  apply: () => void;
};
const coverageSchema = z.record(z.string(), entityClockSchema);
export type RemovalKind = "hard-delete" | "unlink" | "access-loss";
const removalSchema = z.object({
  kind: z.enum(["hard-delete", "unlink", "access-loss"]),
  clock: entityClockSchema,
});

/** A collection interface for feature owners, not a transport interface for UI. */
export class EntityCollection<T extends { id: string }> {
  readonly collection: Collection<T, string, {}>;
  private writer!: SyncWriter<T>;
  private disposed = false;
  private readonly listeners = new Map<string, Set<() => void>>();
  private subscription;
  private inactive = false;
  private readyPromise: Promise<void> | undefined;
  private cleanupPromise: Promise<void> | undefined;
  private used = false;
  private readonly confirmations = new Map<string, Set<() => void>>();

  constructor(
    client: DbClient,
    scopeId: string,
    readonly registration: EntityRegistration<T>,
    private readonly publication: DataPublication,
    private readonly retain: () => () => void = () => () => {},
  ) {
    this.collection = client.collection(
      collectionOptions<T, string, {}>({
        id: `${scopeId}:${registration.name}`,
        getKey: (entity: T) => entity.id,
        startSync: true,
        sync: {
          rowUpdateMode: "partial",
          sync: (writer) => {
            this.writer = writer;
            writer.markReady();
          },
        },
      }),
    );
    this.subscription = this.observe();
  }

  private observe() {
    return this.collection.subscribeChanges((changes) => {
      const callbacks = new Set<() => void>();
      for (const change of changes) {
        for (const callback of this.listeners.get(change.key) ?? []) callbacks.add(callback);
      }
      this.publication.changed(callbacks);
    });
  }

  /** Merge with the library's authoritative base, never the optimistic view. */
  prepare(patch: Partial<T> & { id: string }): T {
    this.assertActive();
    const supplied = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    return this.registration.schema.parse({ ...this.collection.base.get(patch.id), ...supplied });
  }

  stage(
    patches: readonly (Partial<T> & { id: string })[],
    clockOverride?: EntityClock,
  ): PreparedIngestion {
    if (clockOverride) entityClockSchema.parse(clockOverride);
    // Validate even a stale response before accepting it as a transport success.
    for (const patch of patches) this.prepare(patch);
    const prepare = (context: PreparationContext = new Map()) => {
      this.assertActive();
      const planned = context.get(this) ?? new Map<string, unknown>();
      context.set(this, planned);
      const plannedSchema = z.object({
        entity: this.registration.schema.optional(),
        fields: coverageSchema,
        removal: removalSchema.optional(),
      });
      const entities = new Map<string, T>();
      const coverage = new Map<string, z.infer<typeof coverageSchema>>();
      for (const patch of patches) {
        const clock = clockOverride ?? this.registration.clock?.(patch);
        if (clock) entityClockSchema.parse(clock);
        const previousPlan = plannedSchema.optional().parse(planned.get(patch.id));
        const removed =
          previousPlan?.removal ??
          removalSchema.optional().parse(this.metadata().collection.get(`removed:${patch.id}`));
        if (removed && (!clock || compareClocks(clock, removed.clock) <= 0)) continue;
        const fields =
          previousPlan?.fields ??
          coverage.get(patch.id) ??
          coverageSchema.parse(this.metadata().row.get(patch.id) ?? {});
        const supplied: Record<string, unknown> = { id: patch.id };
        const current =
          previousPlan?.entity ?? entities.get(patch.id) ?? this.collection.base.get(patch.id);
        for (const [field, value] of Object.entries(patch)) {
          if (value === undefined) continue;
          const previous = fields[field];
          if (clock && previous && compareClocks(clock, previous) < 0) continue;
          if (
            this.registration.partialObjects?.includes(field as keyof T & string) &&
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
          ) {
            const currentValue = current && Reflect.get(current, field);
            const merged: Record<string, unknown> =
              currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
                ? { ...currentValue }
                : {};
            for (const [key, item] of Object.entries(value)) {
              if (item === undefined) continue;
              const path = JSON.stringify([field, key]);
              const prior = fields[path];
              if (clock && prior && compareClocks(clock, prior) < 0) continue;
              merged[key] = item;
              if (clock) fields[path] = clock;
            }
            supplied[field] = merged;
            continue;
          }
          if (
            clock &&
            this.registration.partialObjects?.includes(field as keyof T & string) &&
            Object.entries(fields).some(
              ([path, fieldClock]) =>
                path.startsWith(`[${JSON.stringify(field)},`) &&
                compareClocks(clock, fieldClock) < 0,
            )
          )
            continue;
          Object.assign(supplied, { [field]: value });
          if (clock) fields[field] = clock;
        }
        const entity = this.registration.schema.parse({
          ...current,
          ...supplied,
        });
        entities.set(entity.id, entity);
        coverage.set(entity.id, fields);
        planned.set(entity.id, { entity, fields });
      }
      return () => this.writePrepared([...entities.values()], coverage);
    };
    return { prepare, apply: () => prepare()() };
  }

  private writePrepared(
    entities: readonly T[],
    coverage?: Map<string, z.infer<typeof coverageSchema>>,
  ) {
    this.assertActive();
    for (const entity of entities) {
      if (JSON.stringify(this.collection.base.get(entity.id)) !== JSON.stringify(entity))
        for (const retire of this.confirmations.get(entity.id) ?? []) retire();
    }
    this.used = true;
    this.writer.begin({ immediate: true });
    for (const entity of entities) {
      this.writer.write({
        type: this.collection.base.has(entity.id) ? "update" : "insert",
        value: entity,
      });
      if (coverage) this.metadata().row.set(entity.id, coverage.get(entity.id));
      this.metadata().collection.delete(`removed:${entity.id}`);
    }
    const receipt = this.writer.commit();
    // This adapter exclusively uses immediate authoritative writes and no loadSubset.
    // A deferred commit would violate its synchronous publication contract.
    if (receipt !== true) {
      void receipt.catch(() => undefined);
      throw new Error("Shared entity ingestion unexpectedly deferred publication");
    }
  }

  /** Result exclusion is deliberately absent: query references own membership. */
  stageRemoval(id: string, kind: RemovalKind, clock: EntityClock): PreparedIngestion {
    removalSchema.parse({ kind, clock });
    const prepare = (context: PreparationContext = new Map()) => {
      this.assertActive();
      const planned = context.get(this) ?? new Map<string, unknown>();
      context.set(this, planned);
      const previousPlan = z
        .object({ fields: coverageSchema, removal: removalSchema.optional() })
        .optional()
        .parse(planned.get(id));
      const fields =
        previousPlan?.fields ?? coverageSchema.parse(this.metadata().row.get(id) ?? {});
      const previous =
        previousPlan?.removal ??
        removalSchema.optional().parse(this.metadata().collection.get(`removed:${id}`));
      if (
        Object.values(fields).some((fieldClock) => compareClocks(clock, fieldClock) < 0) ||
        (previous && compareClocks(clock, previous.clock) < 0)
      )
        return () => {};
      planned.set(id, { fields: {}, removal: { kind, clock } });
      return () => {
        this.assertActive();
        this.used = true;
        this.writer.begin({ immediate: true });
        const entity = this.collection.base.get(id);
        if (entity) for (const retire of this.confirmations.get(id) ?? []) retire();
        if (entity) this.writer.write({ type: "delete", value: entity });
        this.metadata().collection.set(`removed:${id}`, { kind, clock });
        const receipt = this.writer.commit();
        if (receipt !== true) {
          void receipt.catch(() => undefined);
          throw new Error("Shared entity removal unexpectedly deferred publication");
        }
      };
    };
    return { prepare, apply: () => prepare()() };
  }

  private metadata() {
    if (!this.writer.metadata)
      throw new Error("Shared collection requires the public sync metadata API");
    return this.writer.metadata;
  }

  onConfirmed(id: string, retire: () => void) {
    const callbacks = this.confirmations.get(id) ?? new Set();
    callbacks.add(retire);
    this.confirmations.set(id, callbacks);
    return () => {
      callbacks.delete(retire);
      if (!callbacks.size) this.confirmations.delete(id);
    };
  }

  get(id: string): T | undefined {
    if (this.disposed || this.inactive) return undefined;
    return this.collection.get(id);
  }

  subscribe(id: string, callback: () => void): () => void {
    this.assertActive();
    const release = this.retain();
    const listeners = this.listeners.get(id) ?? new Set();
    listeners.add(callback);
    this.listeners.set(id, listeners);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) this.listeners.delete(id);
      release();
    };
  }

  get hasSubscribers() {
    return this.listeners.size > 0;
  }

  /** Public lifecycle APIs only; cleanup must finish before preload starts. */
  async ready() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      if (this.disposed) throw new Error("Shared data collection is disposed");
      await this.cleanupPromise;
      if (this.disposed) throw new Error("Shared data collection is disposed");
      if (!this.inactive) return;
      await this.collection.preload();
      if (this.disposed) return;
      this.inactive = false;
      this.subscription = this.observe();
    })();
    try {
      await this.readyPromise;
    } finally {
      this.readyPromise = undefined;
    }
  }

  async releaseInactive() {
    if (
      this.disposed ||
      this.inactive ||
      !this.used ||
      this.hasSubscribers ||
      this.confirmations.size
    )
      return;
    this.inactive = true;
    this.subscription.unsubscribe();
    this.cleanupPromise = this.collection.cleanup();
    await this.cleanupPromise;
    this.publication.changed([]);
  }

  async dispose() {
    this.disposed = true;
    this.listeners.clear();
    for (const callbacks of this.confirmations.values()) for (const retire of callbacks) retire();
    this.confirmations.clear();
    this.subscription.unsubscribe();
    await this.cleanupPromise;
    await this.collection.cleanup();
  }

  private assertActive() {
    if (this.disposed) throw new Error("Shared data collection is disposed");
    if (this.inactive) throw new Error("Inactive collection requires an authorized recovery read");
  }
}
