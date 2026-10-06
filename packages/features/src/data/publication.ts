/** Notifications describe publication, never a second copy of entity data. */
export class DataPublication {
  private depth = 0;
  private pending = new Set<() => void>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private dirty = false;

  getRevision = () => this.revision;

  get isPublishing() {
    return this.depth !== 0;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  batch<T>(operation: () => T): T {
    this.depth += 1;
    try {
      return operation();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) this.flush();
    }
  }

  changed(listeners: Iterable<() => void>) {
    this.dirty = true;
    for (const listener of listeners) this.pending.add(listener);
    for (const listener of this.listeners) this.pending.add(listener);
    if (this.depth === 0) this.flush();
  }

  private flush() {
    if (!this.dirty && this.pending.size === 0) return;
    this.dirty = false;
    this.revision += 1;
    const notifications = this.pending;
    this.pending = new Set();
    for (const notify of notifications) notify();
  }

  dispose() {
    this.listeners.clear();
    this.pending.clear();
    this.dirty = false;
  }
}
