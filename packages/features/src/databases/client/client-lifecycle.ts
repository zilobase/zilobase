type CleanupTarget = {
  cleanup(): Promise<void> | void
}

const pendingCleanup = new WeakMap<CleanupTarget, ReturnType<typeof setTimeout>>()

/**
 * Defers disposal through React Strict Mode's development-only effect replay.
 * Reacquiring the same client before the next task cancels the provisional
 * cleanup, while replacing the client still disposes the old instance.
 */
export function retainDatabaseClient(client: CleanupTarget) {
  const scheduled = pendingCleanup.get(client)
  if (scheduled) {
    clearTimeout(scheduled)
    pendingCleanup.delete(client)
  }

  let released = false
  return () => {
    if (released) return
    released = true
    const timer = setTimeout(() => {
      if (pendingCleanup.get(client) !== timer) return
      pendingCleanup.delete(client)
      void client.cleanup()
    }, 0)
    pendingCleanup.set(client, timer)
  }
}
