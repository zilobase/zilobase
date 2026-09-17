import type {
  DatabaseClientCommand,
  DatabaseCommandTarget,
  DatabaseEntityCommandState,
} from "../db-client"
import { databaseCommandLane } from "../command-lanes"

const idle: DatabaseEntityCommandState = Object.freeze({
  error: null, isPending: false, pendingCount: 0,
})

export class DatabaseCommandStateStore {
  private readonly states = new Map<string, DatabaseEntityCommandState>()
  private readonly failures = new Map<string, Map<string, Error>>()
  private readonly listeners = new Map<string, Set<() => void>>()

  get(target: DatabaseCommandTarget) {
    return this.states.get(targetKey(target)) ?? idle
  }

  subscribe(target: DatabaseCommandTarget, listener: () => void) {
    const key = targetKey(target)
    const listeners = this.listeners.get(key) ?? new Set()
    listeners.add(listener)
    this.listeners.set(key, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(key)
    }
  }

  track<T>(input: DatabaseClientCommand, promise: Promise<T>) {
    const targets = commandTargets(input)
    const lane = databaseCommandLane(input).key
    for (const target of targets) this.update(target, lane, 1)
    return promise.then(
      (result) => {
        for (const target of targets) this.update(target, lane, -1)
        return result
      },
      (cause) => {
        const error = cause instanceof Error ? cause : new Error(String(cause))
        for (const target of targets) this.update(target, lane, -1, error)
        throw cause
      },
    )
  }

  clear() {
    this.states.clear()
    this.failures.clear()
    this.listeners.clear()
  }

  reportError(input: DatabaseClientCommand, error: Error) {
    for (const target of commandTargets(input)) {
      this.update(target, databaseCommandLane(input).key, 0, error)
    }
  }

  private update(target: DatabaseCommandTarget, lane: string, delta: number, error?: Error) {
    const key = targetKey(target)
    const failures = this.failures.get(key) ?? new Map<string, Error>()
    if (delta > 0) failures.delete(lane)
    if (error) failures.set(lane, error)
    this.failures.set(key, failures)
    const pendingCount = Math.max(0, this.get(target).pendingCount + delta)
    this.states.set(key, {
      error: [...failures.values()].at(-1) ?? null,
      isPending: pendingCount > 0,
      pendingCount,
    })
    for (const listener of this.listeners.get(key) ?? []) listener()
  }
}

function targetKey(target: DatabaseCommandTarget) {
  return JSON.stringify([
    target.hostDatabaseId ?? null, target.dataSourceId ?? null,
    target.viewId ?? null, target.rowId ?? null, target.propertyId ?? null,
  ])
}

function commandTargets(input: DatabaseClientCommand): DatabaseCommandTarget[] {
  const targets: DatabaseCommandTarget[] = [{}, { hostDatabaseId: input.databaseId }]
  const { command, dataSourceId } = input
  if (!dataSourceId) {
    if (command.type.startsWith("view.") && "viewId" in command) {
      targets.push({ hostDatabaseId: input.databaseId, viewId: command.viewId })
    }
    if (command.type === "dataSource.link" || command.type === "dataSource.unlink") {
      targets.push({ dataSourceId: command.dataSourceId })
    }
    return targets
  }
  targets.push({ dataSourceId })
  if ("rowId" in command) targets.push({ dataSourceId, rowId: command.rowId })
  if (command.type === "cell.set") {
    targets.push({ dataSourceId, rowId: command.rowId, propertyId: command.propertyId })
  } else if ("propertyId" in command) {
    targets.push({ dataSourceId, propertyId: command.propertyId })
  }
  return targets
}
