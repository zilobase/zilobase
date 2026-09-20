import type { RoomState } from "@zilobase/runtime-ports";

type DurableStorage = {
  delete(key: string): Promise<boolean>;
  deleteAlarm(): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  getAlarm(): Promise<number | null>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(timestamp: number): Promise<void>;
};

export function createWorkerRoomState(storage: DurableStorage): RoomState {
  return {
    get: (key) => storage.get(key),
    put: (key, value) => storage.put(key, value),
    delete: (key) => storage.delete(key),
    list: (options) => storage.list(options),
    getAlarm: () => storage.getAlarm(),
    async setAlarm(timestamp) {
      if (timestamp === null) await storage.deleteAlarm();
      else await storage.setAlarm(timestamp);
    },
  };
}
