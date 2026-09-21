import { prepareCalendarDatabasesForDeletion } from "@/features/calendar/storage/calendar-database"
import { prepareMailDatabasesForDeletion } from "@/features/mail/storage/mail-database"
import type { DesktopServer } from "@/platform/server/desktop-server"

/** Drops re-fetchable mail and calendar caches during identity changes. */
export async function clearIndexedDataForServer(server?: DesktopServer | null) {
  const cachePrefix = server
    ? `zilobase:v2:${encodeURIComponent(new URL(server.apiOrigin).origin)}:`
    : "zilobase:"
  await Promise.all([
    prepareMailDatabasesForDeletion(cachePrefix).catch(() => undefined),
    prepareCalendarDatabasesForDeletion(cachePrefix).catch(() => undefined),
  ])
  await deleteIndexedDatabasesForPrefix(cachePrefix)
}

export async function clearAllIndexedData() {
  return clearIndexedDataForServer(null)
}

function deleteIndexedDatabase(name: string) {
  return new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name)
      request.addEventListener("success", () => resolve())
      request.addEventListener("error", () => resolve())
      request.addEventListener("blocked", () => resolve())
    } catch {
      resolve()
    }
  })
}

async function deleteIndexedDatabasesForPrefix(prefix: string) {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
    return
  }
  const databases = await indexedDB.databases()
  const names = databases.flatMap((database) =>
    database.name?.startsWith(prefix) ? [database.name] : [],
  )
  await Promise.all(names.map(deleteIndexedDatabase))
}
