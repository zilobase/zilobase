export type DatabaseRowDropOwner = object

type DatabaseRowDropOwnerListener = (
  owner: DatabaseRowDropOwner | null,
) => void

let activeOwner: DatabaseRowDropOwner | null = null
const listeners = new Set<DatabaseRowDropOwnerListener>()

function notifyOwnerChange() {
  for (const listener of listeners) listener(activeOwner)
}

export function claimDatabaseRowDropOwner(owner: DatabaseRowDropOwner) {
  if (activeOwner === owner) return

  activeOwner = owner
  notifyOwnerChange()
}

export function releaseDatabaseRowDropOwner(owner: DatabaseRowDropOwner) {
  if (activeOwner !== owner) return

  activeOwner = null
  notifyOwnerChange()
}

export function subscribeDatabaseRowDropOwner(
  listener: DatabaseRowDropOwnerListener,
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetDatabaseRowDropOwner() {
  if (activeOwner === null) return

  activeOwner = null
  notifyOwnerChange()
}
