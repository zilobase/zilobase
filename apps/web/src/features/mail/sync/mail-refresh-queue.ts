const pending = new Map<string, Promise<unknown>>();

export function runMailRefreshOnce<T>(scope: string, run: () => Promise<T>): Promise<T> {
  const existing = pending.get(scope);
  if (existing) return existing as Promise<T>;
  const next = run();
  pending.set(scope, next);
  void next
    .finally(() => {
      if (pending.get(scope) === next) pending.delete(scope);
    })
    .catch(() => {});
  return next;
}
