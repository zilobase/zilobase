import type { Scheduler, Unsubscribe } from "@zilobase/runtime-ports";

type WorkerExecution = { waitUntil(promise: Promise<unknown>): void };
type AlarmStorage = {
  deleteAlarm?(): Promise<void>;
  setAlarm(timestamp: number): Promise<void>;
};

export function createWorkerScheduler(
  execution?: WorkerExecution,
  storage?: AlarmStorage,
): Scheduler {
  const waitUntil = (promise: Promise<unknown>) => {
    if (execution) execution.waitUntil(promise);
    else void promise.catch(() => undefined);
  };
  return {
    after(milliseconds, operation): Unsubscribe {
      let cancelled = false;
      const promise = new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }).then(async () => {
        if (!cancelled) await operation();
      });
      waitUntil(promise);
      return () => { cancelled = true; };
    },
    async setAlarm(timestamp) {
      if (!storage) throw new Error("Durable Object alarm storage is required");
      if (timestamp === null) {
        await storage.deleteAlarm?.();
        return;
      }
      await storage.setAlarm(timestamp);
    },
    waitUntil,
  };
}
