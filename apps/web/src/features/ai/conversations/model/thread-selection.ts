type Thread = { id: string; pinnedAt?: unknown };

export function keepSelectedThread(activeThreadId: string | null, threads: Thread[]) {
  return Boolean(activeThreadId && threads.some((thread) => thread.id === activeThreadId));
}

export function demoFallbackThreadId(threads: Thread[], hostedDemo: boolean) {
  if (!hostedDemo) return null;
  return threads.find((thread) => thread.pinnedAt)?.id ?? threads[0]?.id ?? null;
}
