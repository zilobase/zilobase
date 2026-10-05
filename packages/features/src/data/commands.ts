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
    const key = JSON.stringify([owner.collection.id, id]);
    const preceding = this.tails.get(key) ?? Promise.resolve();
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
        const release = owner.onConfirmed(id, () => transaction.rollback());
        try {
          transaction.mutate(() => owner.collection.update(id, preview));
          void transaction.commit().catch((error) => reject(error));
          return await receipt;
        } finally {
          release();
        }
      });
    this.tails.set(key, command);
    void command
      .finally(() => {
        if (this.tails.get(key) === command) this.tails.delete(key);
      })
      .catch(() => undefined);
    return command;
  }
}
