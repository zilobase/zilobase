import type { EntityCollection } from "./collection";
import type { DataSession } from "./session";

/** Serializes entity previews while the existing transport owns delivery and receipts. */
export class DataCommands {
  private readonly tails = new Map<string, Promise<unknown>>();
  constructor(private readonly session: DataSession) {}

  run<T extends { id: string }, R>(
    owner: EntityCollection<T>,
    id: string,
    preview: Parameters<EntityCollection<T>["collection"]["update"]>[2],
    confirm: () => Promise<R>,
  ): Promise<R> {
    return this.runMany([entityPreview(owner, id, preview)], confirm);
  }

  runMany<R>(previews: readonly EntityPreview[], confirm: () => Promise<R>): Promise<R> {
    const keys = [...new Set(previews.map((preview) => preview.resource))];
    const preceding = Promise.all(keys.map((key) => this.tails.get(key)?.catch(() => undefined)));
    const command = preceding
      .catch(() => undefined)
      .then(async () => {
        let accept!: (result: R) => void;
        let reject!: (error: unknown) => void;
        const receipt = new Promise<R>((resolve, fail) => {
          accept = resolve;
          reject = fail;
        });
        const transaction = this.session.client.createTransaction({
          autoCommit: false,
          mutationFn: async () => {
            try {
              accept(await confirm());
            } catch (error) {
              reject(error);
              throw error;
            }
          },
        });
        void transaction.when("settled").catch(() => undefined);
        const releases = previews.map((preview) =>
          preview.onConfirmed(() => this.session.publication.batch(() => transaction.rollback())),
        );
        try {
          this.session.batch(() => {
            try {
              transaction.mutate(() => previews.forEach((preview) => preview.apply()));
            } catch (error) {
              transaction.rollback();
              throw error;
            }
          });
          void transaction.commit().catch((error) => reject(error));
          return await receipt;
        } finally {
          releases.forEach((release) => release());
        }
      });
    for (const key of keys) this.tails.set(key, command);
    void command
      .finally(() => {
        for (const key of keys) if (this.tails.get(key) === command) this.tails.delete(key);
      })
      .catch(() => undefined);
    return command;
  }
}

export type EntityPreview = {
  resource: string;
  apply: () => void;
  onConfirmed: (retire: () => void) => () => void;
};
export function entityPreview<T extends { id: string }>(
  owner: EntityCollection<T>,
  id: string,
  update: Parameters<EntityCollection<T>["collection"]["update"]>[2],
): EntityPreview {
  return {
    resource: JSON.stringify([owner.collection.id, id]),
    apply: () => owner.collection.update(id, update),
    onConfirmed: (retire) => owner.onConfirmed(id, retire),
  };
}

/** A new stored value has a stable pair identity before its persisted ID arrives. */
export function entityUpsertPreview<T extends { id: string }>(
  owner: EntityCollection<T>,
  entity: T,
  update: Parameters<EntityCollection<T>["collection"]["update"]>[2],
): EntityPreview {
  return {
    resource: JSON.stringify([owner.collection.id, entity.id]),
    apply: () => {
      if (owner.collection.has(entity.id)) owner.collection.update(entity.id, update);
      else owner.collection.insert(entity);
    },
    onConfirmed: (retire) => owner.onConfirmed(entity.id, retire),
  };
}
