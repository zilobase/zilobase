import type { Scheduler, Unsubscribe } from "@zilobase/runtime-ports";

export function createNodeScheduler(): Scheduler {
  return {
    after(milliseconds, operation): Unsubscribe {
      const timer = setTimeout(() => void Promise.resolve(operation()), milliseconds);
      timer.unref();
      return () => clearTimeout(timer);
    },
    async setAlarm(timestamp) {
      if (timestamp === null) return;
      const delay = Math.max(0, timestamp - Date.now());
      const timer = setTimeout(() => undefined, delay);
      timer.unref();
    },
    waitUntil(promise) {
      void promise.catch(() => undefined);
    },
  };
}
