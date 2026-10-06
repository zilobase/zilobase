/** Leases belong to registrations, so late cleanup cannot release another consumer. */
export function createDocumentSessionRegistry<T extends { dispose: () => void }>() {
  const sessions = new Map<string, { session: T; leases: Set<symbol> }>();
  return {
    acquire(key: string, create: () => T) {
      let entry = sessions.get(key);
      if (!entry) {
        entry = { session: create(), leases: new Set() };
        sessions.set(key, entry);
      }
      const token = Symbol(key);
      entry.leases.add(token);
      let released = false;
      return {
        session: entry.session,
        release() {
          if (released) return;
          released = true;
          entry.leases.delete(token);
          if (entry.leases.size === 0 && sessions.get(key) === entry) {
            sessions.delete(key);
            entry.session.dispose();
          }
        },
      };
    },
    dispose() {
      for (const entry of sessions.values()) entry.session.dispose();
      sessions.clear();
    },
    get size() {
      return sessions.size;
    },
  };
}
