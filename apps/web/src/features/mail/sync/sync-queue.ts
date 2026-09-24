const queues = new Map<string, Promise<unknown>>();
const pending = new Map<string, Promise<unknown>>();

export function runMailSyncOnce<T>(
  scope: string,
  request: string,
  run: () => Promise<T>,
): Promise<T> {
  const key = `${scope}:${request}`;
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const next = (queues.get(scope) ?? Promise.resolve()).catch(() => {}).then(run);
  pending.set(key, next);
  queues.set(scope, next);
  void next
    .finally(() => {
      if (pending.get(key) === next) pending.delete(key);
      if (queues.get(scope) === next) queues.delete(scope);
    })
    .catch(() => {});
  return next;
}

export function mailPollDelay(
  pushHealthy: boolean,
  failures: number,
  retryAfterMs = 0,
  random = Math.random(),
) {
  const base = pushHealthy ? 300_000 : 60_000;
  return Math.max(
    retryAfterMs,
    Math.min(900_000, base * 2 ** Math.min(4, failures)) * (1 + random * 0.1),
  );
}
