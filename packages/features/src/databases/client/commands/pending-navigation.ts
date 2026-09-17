import type { DatabaseClient } from "../db-client"

/** Online writes are not queued across reloads. Warn while a save is in flight. */
export function guardPendingDatabaseWrites(client: DatabaseClient, target: Window) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!client.commandState({}).isPending) return
    event.preventDefault()
    event.returnValue = ""
  }
  let listening = false
  const update = () => {
    const pending = client.commandState({}).isPending
    if (pending === listening) return
    listening = pending
    if (pending) target.addEventListener("beforeunload", beforeUnload)
    else target.removeEventListener("beforeunload", beforeUnload)
  }
  const unsubscribe = client.subscribeCommandState({}, update)
  update()
  return () => {
    unsubscribe()
    target.removeEventListener("beforeunload", beforeUnload)
  }
}
