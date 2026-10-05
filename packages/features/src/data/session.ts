import { DbClient } from "@tanstack/db";

import { EntityCollection, type EntityRegistration, type PreparedIngestion } from "./collection";
import { DataCommands } from "./commands";
import { DataPublication } from "./publication";

export type DataSessionScope = {
  deployment: string;
  workspaceId: string;
  viewer:
    | { kind: "account"; accountId: string; actorId: string; sessionId: string }
    | { kind: "guest"; actorId: string; capabilityId: string }
    | { kind: "public"; capabilityId: string };
};

export class DataSession {
  readonly client = new DbClient();
  readonly publication = new DataPublication();
  readonly commands = new DataCommands(this);
  readonly id: string;
  private disposed = false;
  private readonly collections = new Map<string, { dispose: () => Promise<void> }>();

  constructor(readonly scope: DataSessionScope) {
    this.id = JSON.stringify([
      scope.deployment,
      scope.workspaceId,
      scope.viewer,
      crypto.randomUUID(),
    ]);
  }

  register<T extends { id: string }>(registration: EntityRegistration<T>): EntityCollection<T> {
    this.assertActive();
    if (this.collections.has(registration.name))
      throw new Error(`Collection already registered: ${registration.name}`);
    const collection = new EntityCollection(this.client, this.id, registration, this.publication);
    this.collections.set(registration.name, collection);
    return collection;
  }

  batch<T>(operation: () => T): T {
    this.assertActive();
    return this.publication.batch(operation);
  }

  /** Stage every domain's validation before entering the publication boundary. */
  ingest(inputs: readonly PreparedIngestion[]) {
    this.assertActive();
    const context = new Map();
    const writes = inputs.map((input) => input.prepare(context));
    this.batch(() => {
      for (const write of writes) write();
    });
  }

  /** Exports/context readers must never observe an in-progress join. */
  snapshot<T>(read: () => T): { revision: number; value: T } {
    this.assertActive();
    if (this.publication.isPublishing) throw new Error("Shared data publication is in progress");
    const value = read();
    if (value instanceof Promise) throw new Error("Shared data snapshots must be synchronous");
    return { revision: this.publication.getRevision(), value };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.publication.dispose();
    await Promise.all([...this.collections.values()].map((collection) => collection.dispose()));
    this.collections.clear();
    await this.client.cleanup();
  }

  private assertActive() {
    if (this.disposed) throw new Error("Shared data session is disposed");
  }
}
