const starts = new Map<string, number>();
const MAX_AGE_MS = 60_000;

export function markPageNavigationStart(pageId: string) {
  starts.set(pageId, performance.now());
}

export function consumePageNavigationStart(pageId: string) {
  const startedAt = starts.get(pageId);
  starts.delete(pageId);
  if (startedAt === undefined || performance.now() - startedAt > MAX_AGE_MS) return null;
  return startedAt;
}
