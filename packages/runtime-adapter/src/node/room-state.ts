import type { RoomState, Scheduler, Unsubscribe } from "@zilobase/runtime-ports";

export function createNodeRoomState(
  scheduler: Scheduler,
  onAlarm: () => void | Promise<void>,
): RoomState {
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  let cancelAlarm: Unsubscribe | null = null;
  return {
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async put(key, value) { values.set(key, value); },
    async delete(key) { return values.delete(key); },
    async list<T>(options?: { prefix?: string }) {
      return new Map([...values]
        .filter(([key]) => !options?.prefix || key.startsWith(options.prefix))
        .map(([key, value]) => [key, value as T]));
    },
    async getAlarm() { return alarm; },
    async setAlarm(timestamp) {
      cancelAlarm?.();
      cancelAlarm = null;
      alarm = timestamp;
      if (timestamp !== null) {
        cancelAlarm = scheduler.after(Math.max(0, timestamp - Date.now()), async () => {
          alarm = null;
          await onAlarm();
        });
      }
    },
  };
}
