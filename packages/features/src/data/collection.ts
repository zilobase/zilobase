import { collectionOptions, type Collection, type DbClient, type SyncConfig } from "@tanstack/db";
import type { z } from "zod";

import type { DataPublication } from "./publication";

export type EntityRegistration<T extends { id: string }> = {
  name: string;
  schema: z.ZodType<T, T>;
};

type SyncWriter<T extends object> = Parameters<SyncConfig<T, string>["sync"]>[0];

export type PreparedIngestion = { apply: () => void };

/** A collection interface for feature owners, not a transport interface for UI. */
export class EntityCollection<T extends { id: string }> {
  readonly collection: Collection<T, string, {}>;
  private writer!: SyncWriter<T>;
  private disposed = false;
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly subscription;

  constructor(
    client: DbClient,
    scopeId: string,
    readonly registration: EntityRegistration<T>,
    private readonly publication: DataPublication,
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
    this.subscription = this.collection.subscribeChanges((changes) => {
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

  stage(patches: readonly (Partial<T> & { id: string })[]): PreparedIngestion {
    const entities = patches.map((patch) => this.prepare(patch));
    return { apply: () => this.ingestPrepared(entities) };
  }

  /** Inputs must all be prepared before any collection in a batch is written. */
  ingestPrepared(entities: readonly T[]) {
    this.assertActive();
    this.writer.begin({ immediate: true });
    for (const entity of entities) {
      this.writer.write({
        type: this.collection.base.has(entity.id) ? "update" : "insert",
        value: entity,
      });
    }
    const receipt = this.writer.commit();
    // This adapter exclusively uses immediate authoritative writes and no loadSubset.
    // A deferred commit would violate its synchronous publication contract.
    if (receipt !== true) {
      void receipt.catch(() => undefined);
      throw new Error("Shared entity ingestion unexpectedly deferred publication");
    }
  }

  get(id: string): T | undefined {
    this.assertActive();
    return this.collection.get(id);
  }

  subscribe(id: string, callback: () => void): () => void {
    this.assertActive();
    const listeners = this.listeners.get(id) ?? new Set();
    listeners.add(callback);
    this.listeners.set(id, listeners);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) this.listeners.delete(id);
    };
  }

  async dispose() {
    this.disposed = true;
    this.listeners.clear();
    this.subscription.unsubscribe();
    await this.collection.cleanup();
  }

  private assertActive() {
    if (this.disposed) throw new Error("Shared data collection is disposed");
  }
}
