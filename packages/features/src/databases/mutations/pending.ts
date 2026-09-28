export type DatabaseCommandTarget = {
  dataSourceId?: string;
  hostDatabaseId?: string;
  propertyId?: string;
  rowId?: string;
  viewId?: string;
};

export type DatabaseEntityCommandState = {
  error: Error | null;
  isPending: boolean;
  pendingCount: number;
};

const empty: DatabaseEntityCommandState = { error: null, isPending: false, pendingCount: 0 };

export function pendingKeyForTarget(target: DatabaseCommandTarget): string {
  return JSON.stringify([
    target.hostDatabaseId ?? null,
    target.dataSourceId ?? null,
    target.viewId ?? null,
    target.rowId ?? null,
    target.propertyId ?? null,
  ]);
}

/** Owned by one session controller, never shared across actors or QueryClients. */
export class DatabaseCommandState {
  private states = new Map<string, DatabaseEntityCommandState>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get = (target: DatabaseCommandTarget): DatabaseEntityCommandState =>
    this.states.get(pendingKeyForTarget(target)) ?? empty;
  hasPending = () => [...this.states.values()].some(({ isPending }) => isPending);
  private publish() {
    for (const listener of this.listeners) listener();
  }
  begin(targets: DatabaseCommandTarget[]) {
    for (const target of targets) {
      const current = this.get(target);
      this.states.set(pendingKeyForTarget(target), {
        error: null,
        isPending: true,
        pendingCount: current.pendingCount + 1,
      });
    }
    this.publish();
  }
  end(targets: DatabaseCommandTarget[], error?: Error | null) {
    for (const target of targets) {
      const current = this.get(target);
      const pendingCount = Math.max(0, current.pendingCount - 1);
      this.states.set(pendingKeyForTarget(target), {
        error: error === undefined ? current.error : error,
        isPending: pendingCount > 0,
        pendingCount,
      });
    }
    this.publish();
  }
  report(targets: DatabaseCommandTarget[], error: Error) {
    for (const target of targets)
      this.states.set(pendingKeyForTarget(target), { ...this.get(target), error });
    this.publish();
  }
  clear() {
    this.states.clear();
    this.publish();
  }
}

export function targetsForCommand(input: {
  dataSourceId?: string | null;
  databaseId: string;
  command: { type: string } & Record<string, unknown>;
}): DatabaseCommandTarget[] {
  const targets: DatabaseCommandTarget[] = [{}, { hostDatabaseId: input.databaseId }];
  const { command, dataSourceId } = input;
  if (!dataSourceId) {
    if (
      command.type.startsWith("view.") &&
      "viewId" in command &&
      typeof command.viewId === "string"
    ) {
      targets.push({
        hostDatabaseId: input.databaseId,
        viewId: command.viewId,
      });
    }
    if (command.type === "dataSource.link" || command.type === "dataSource.unlink") {
      const sourceId = (command as { dataSourceId?: unknown }).dataSourceId;
      if (typeof sourceId === "string") targets.push({ dataSourceId: sourceId });
    }
    return targets;
  }
  targets.push({ dataSourceId });
  if ("rowId" in command && typeof command.rowId === "string") {
    targets.push({ dataSourceId, rowId: command.rowId });
  }
  if (command.type === "row.change") {
    const rowId = command.rowId;
    const values = command.valuesByPropertyId;
    if (typeof rowId === "string" && values && typeof values === "object") {
      for (const propertyId of Object.keys(values))
        targets.push({ dataSourceId, propertyId, rowId });
    }
  }
  if (command.type === "row.place" && command.source && typeof command.source === "object") {
    const source = command.source as { databaseId: string; dataSourceId: string; rowId: string };
    if (source.databaseId !== input.databaseId) targets.push({ hostDatabaseId: source.databaseId });
    targets.push(
      { dataSourceId: source.dataSourceId },
      { dataSourceId: source.dataSourceId, rowId: source.rowId },
    );
  }
  if ("propertyId" in command && typeof command.propertyId === "string") {
    targets.push({ dataSourceId, propertyId: command.propertyId });
  }
  return targets;
}
