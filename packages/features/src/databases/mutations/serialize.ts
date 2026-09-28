const tails = new Map<string, Promise<void>>();

export function runSerialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let releaseTail: () => void = () => undefined;
  const tail = new Promise<void>((resolve) => {
    releaseTail = resolve;
  });
  tails.set(key, tail);
  const next = prev.catch(() => undefined).then(fn);
  next
    .catch(() => undefined)
    .finally(() => {
      if (tails.get(key) === tail) tails.delete(key);
      releaseTail();
    });
  return next;
}

export const viewSerializationKey = (hostDatabaseId: string) => `view:${hostDatabaseId}`;
export const structuralSerializationKey = (dataSourceId: string) => `structural:${dataSourceId}`;
export function clearSerializationStateForTests() {
  tails.clear();
}
