export function loadMailThreadOnce(
  inFlight: Map<string, Promise<void>>,
  key: string,
  load: () => Promise<void>,
) {
  const existing = inFlight.get(key)
  if (existing) return existing
  const pending = load()
  inFlight.set(key, pending)
  const cleanup = () => {
    if (inFlight.get(key) === pending) inFlight.delete(key)
  }
  void pending.then(cleanup, cleanup)
  return pending
}
