import { useMemo, useSyncExternalStore } from "react";

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

type PendingEntry = {
  error: Error | null;
  pendingCount: number;
};

const states = new Map<string, PendingEntry>();
const listenersByKey = new Map<string, Set<() => void>>();
const anyListeners = new Set<() => void>();

export function pendingKeyForTarget(target: DatabaseCommandTarget): string {
  return JSON.stringify([
    target.hostDatabaseId ?? null,
    target.dataSourceId ?? null,
    target.viewId ?? null,
    target.rowId ?? null,
    target.propertyId ?? null,
  ]);
}

export function getPendingState(
  target: DatabaseCommandTarget,
): DatabaseEntityCommandState {
  const entry = states.get(pendingKeyForTarget(target));
  return {
    error: entry?.error ?? null,
    isPending: (entry?.pendingCount ?? 0) > 0,
    pendingCount: entry?.pendingCount ?? 0,
  };
}

export function subscribePendingState(
  target: DatabaseCommandTarget,
  listener: () => void,
): () => void {
  const key = pendingKeyForTarget(target);
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByKey.delete(key);
  };
}

export function subscribeAnyPending(listener: () => void): () => void {
  anyListeners.add(listener);
  return () => {
    anyListeners.delete(listener);
  };
}

export function hasPendingDatabaseWrites(): boolean {
  for (const entry of states.values()) {
    if (entry.pendingCount > 0) return true;
  }
  return false;
}

function notifyKey(key: string) {
  for (const listener of listenersByKey.get(key) ?? []) listener();
  for (const listener of anyListeners) listener();
}

/** Increment pending for targets; clear error for those keys only. */
export function beginPending(targets: DatabaseCommandTarget[]): void {
  for (const target of targets) {
    const key = pendingKeyForTarget(target);
    const current = states.get(key) ?? { error: null, pendingCount: 0 };
    states.set(key, {
      error: null,
      pendingCount: current.pendingCount + 1,
    });
    notifyKey(key);
  }
}

/** Decrement pending; on error store last error, on success keep cleared error. */
export function endPending(
  targets: DatabaseCommandTarget[],
  error?: Error | null,
): void {
  for (const target of targets) {
    const key = pendingKeyForTarget(target);
    const current = states.get(key) ?? { error: null, pendingCount: 0 };
    states.set(key, {
      error: error ?? current.error,
      pendingCount: Math.max(0, current.pendingCount - 1),
    });
    notifyKey(key);
  }
}

export function reportPendingError(
  targets: DatabaseCommandTarget[],
  error: Error,
): void {
  for (const target of targets) {
    const key = pendingKeyForTarget(target);
    const current = states.get(key) ?? { error: null, pendingCount: 0 };
    states.set(key, { error, pendingCount: current.pendingCount });
    notifyKey(key);
  }
}

export function targetsForCommand(input: {
  dataSourceId?: string | null;
  databaseId: string;
  command: { type: string } & Record<string, unknown>;
}): DatabaseCommandTarget[] {
  const targets: DatabaseCommandTarget[] = [
    {},
    { hostDatabaseId: input.databaseId },
  ];
  const { command, dataSourceId } = input;
  if (!dataSourceId) {
    if (
      command.type.startsWith("view.") && "viewId" in command &&
      typeof command.viewId === "string"
    ) {
      targets.push({
        hostDatabaseId: input.databaseId,
        viewId: command.viewId,
      });
    }
    if (
      command.type === "dataSource.link" ||
      command.type === "dataSource.unlink"
    ) {
      const sourceId = (command as { dataSourceId?: unknown }).dataSourceId;
      if (typeof sourceId === "string") targets.push({ dataSourceId: sourceId });
    }
    return targets;
  }
  targets.push({ dataSourceId });
  if ("rowId" in command && typeof command.rowId === "string") {
    targets.push({ dataSourceId, rowId: command.rowId });
  }
  if (command.type === "cell.set") {
    const rowId = (command as { rowId?: unknown }).rowId;
    const propertyId = (command as { propertyId?: unknown }).propertyId;
    if (typeof rowId === "string" && typeof propertyId === "string") {
      targets.push({ dataSourceId, propertyId, rowId });
    }
  } else if ("propertyId" in command && typeof command.propertyId === "string") {
    targets.push({ dataSourceId, propertyId: command.propertyId });
  }
  return targets;
}

export function useDatabaseEntityCommandState(
  target: DatabaseCommandTarget,
): DatabaseEntityCommandState {
  const stableTarget = useMemo(() => ({
    dataSourceId: target.dataSourceId,
    hostDatabaseId: target.hostDatabaseId,
    propertyId: target.propertyId,
    rowId: target.rowId,
    viewId: target.viewId,
  }), [
    target.dataSourceId,
    target.hostDatabaseId,
    target.propertyId,
    target.rowId,
    target.viewId,
  ]);
  return useSyncExternalStore(
    (listener) => subscribePendingState(stableTarget, listener),
    () => getPendingState(stableTarget),
    () => getPendingState(stableTarget),
  );
}

/** Test-only: reset all pending state. */
export function clearPendingStateForTests(): void {
  states.clear();
  listenersByKey.clear();
  anyListeners.clear();
}
