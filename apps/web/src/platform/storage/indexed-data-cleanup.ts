import { prepareCalendarDatabasesForDeletion } from "@/features/calendar/storage/calendar-database"
import { prepareMailDatabasesForDeletion } from "@/features/mail/storage/mail-database"
import type { DesktopServer } from "@/platform/server/desktop-server"

/**
 * Clears local IndexedDB caches (mail/calendar Dexie databases plus legacy
 * offline document databases). Per-page offline drafts were removed; this only
 * drops re-fetchable caches when switching servers, signing out, or deleting
 * an account.
 */
export async function clearIndexedDataForServer(server?: DesktopServer | null) {
  const cachePrefix = server
    ? `zilobase:v2:${encodeURIComponent(new URL(server.apiOrigin).origin)}:`
    : "zilobase:"
  const legacyDocumentPrefix = server
    ? `zilobase:v1:${encodeURIComponent(new URL(server.apiOrigin).origin)}:`
    : "zilobase:v1:"
  await Promise.all([
    prepareMailDatabasesForDeletion(cachePrefix).catch(() => undefined),
    prepareCalendarDatabasesForDeletion(cachePrefix).catch(() => undefined),
  ])
  await Promise.all([
    deleteIndexedDatabasesForPrefix(cachePrefix),
    deleteIndexedDatabasesForPrefix(legacyDocumentPrefix),
    clearLegacyOfflineKeys(server).catch(() => undefined),
  ])
}

export async function clearAllIndexedData() {
  return clearIndexedDataForServer(null)
}

async function clearLegacyOfflineKeys(server?: DesktopServer | null) {
  const { del, keys } = await import("idb-keyval")
  const bases = ["zilobase-offline-manifest-v1", "zilobase-offline-query-cache-v1"]
  const targets = server
    ? bases.map((base) => `${base}:${server.instanceId}`)
    : (await keys()).filter(
        (key): key is string =>
          typeof key === "string" &&
          bases.some((base) => key === base || key.startsWith(`${base}:`)),
      )
  await Promise.all(targets.map((key) => del(key).catch(() => undefined)))
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
