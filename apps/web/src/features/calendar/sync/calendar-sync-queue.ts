import type { CalendarDatabase } from "../storage/calendar-database";
type Job = {
  key: string;
  priority: number;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (cause: unknown) => void;
};
const queues = new Map<string, { active: boolean; jobs: Job[] }>(),
  requests = new Map<string, Promise<unknown>>();
export function runCalendarSyncOnce<T>(
  database: CalendarDatabase,
  requestKey: string,
  run: () => Promise<T>,
  priority = 0,
): Promise<T> {
  const key = `${database.name}:${requestKey}`;
  let queue = queues.get(database.name);
  if (!queue) {
    queue = { active: false, jobs: [] };
    queues.set(database.name, queue);
  }
  const existing = requests.get(key);
  if (existing) {
    const job = queue.jobs.find((job) => job.key === key);
    if (job) job.priority = Math.max(priority, job.priority);
    return existing as Promise<T>;
  }
  const request = new Promise<unknown>((resolve, reject) =>
    queue!.jobs.push({ key, priority, run, resolve, reject }),
  );
  requests.set(key, request);
  const drain = async () => {
    if (queue!.active) return;
    queue!.active = true;
    while (queue!.jobs.length) {
      queue!.jobs.sort((a, b) => b.priority - a.priority);
      const job = queue!.jobs.shift()!;
      try {
        job.resolve(await job.run());
      } catch (cause) {
        job.reject(cause);
      } finally {
        requests.delete(job.key);
      }
    }
    queue!.active = false;
    queues.delete(database.name);
  };
  void drain();
  return request as Promise<T>;
}
