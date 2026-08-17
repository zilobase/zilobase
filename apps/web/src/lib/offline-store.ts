import { isTauri } from "@tauri-apps/api/core"
import {
  desktopPersistKey,
  resolveRuntimeApiOrigin,
  type DesktopServer,
} from "@/lib/desktop-server"
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client"
import type { Query } from "@tanstack/react-query"
import { del, get, set } from "idb-keyval"
import { getDesktopAuthOwner, getDesktopAuthToken } from "@/lib/desktop-auth-token"

export const OFFLINE_SCHEMA_VERSION = 1
export const OFFLINE_CACHE_BUSTER = `zilobase-offline-v${OFFLINE_SCHEMA_VERSION}`
export const OFFLINE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 24

const MANIFEST_KEY_BASE = "zilobase-offline-manifest-v1"
const QUERY_CACHE_KEY_BASE = "zilobase-offline-query-cache-v1"

export function offlineManifestKey(server?: DesktopServer | null) {
  return desktopPersistKey(MANIFEST_KEY_BASE, server ?? undefined)
}

export function offlineQueryCacheKey(server?: DesktopServer | null) {
  return desktopPersistKey(QUERY_CACHE_KEY_BASE, server ?? undefined)
}

async function readNamespacedValue<T>(key: string) {
  const stored = await get<T>(key).catch(() => null)
  if (stored != null) return stored
  if (!key.includes(":")) return null

  const base = key.slice(0, key.lastIndexOf(":"))
  if (base !== MANIFEST_KEY_BASE && base !== QUERY_CACHE_KEY_BASE) return null

  const legacy = await get<T>(base).catch(() => null)
  if (legacy == null) return null
  await set(key, legacy).catch(() => undefined)
  return legacy
}

export type ConnectivityState =
  | "checking"
  | "online"
  | "offline"
  | "service-unavailable"

export type OfflineItemKind = "page" | "database"
export type OfflineItem = {
  availableAt: string
  blocked?: boolean
  confirmedStateVector?: string
  dirty?: boolean
  id: string
  kind: OfflineItemKind
  lastSyncedAt?: string
  name: string
  pageId?: string | null
  workspaceId: string
}

export type OfflineWorkspace = {
  enabledAt: string
  id: string
  name: string
  slug: string
}

export type OfflineSessionSnapshot = {
  session: {
    activeWorkspaceId?: string | null
    expiresAt: string
    id: string
    userId: string
  }
  user: {
    email: string
    emailVerified: boolean
    hasPassword: boolean
    id: string
    image?: string | null
    name: string
  }
  validatedAt: string
  workspacePinned?: boolean
}

export type OfflineManifest = {
  accountId: string | null
  apiOrigin: string
  items: OfflineItem[]
  schemaVersion: number
  session: OfflineSessionSnapshot | null
  workspaces: OfflineWorkspace[]
}

const emptyManifest = (): OfflineManifest => ({
  accountId: null,
  apiOrigin: getOfflineApiOrigin(),
  items: [],
  schemaVersion: OFFLINE_SCHEMA_VERSION,
  session: null,
  workspaces: [],
})

let manifest = emptyManifest()
let manifestLoaded = false
let manifestLoad: Promise<OfflineManifest> | null = null
let connectivity: ConnectivityState =
  typeof navigator !== "undefined" && navigator.onLine === false
    ? "offline"
    : "checking"

const manifestListeners = new Set<() => void>()
const connectivityListeners = new Set<() => void>()

export function isDesktopOfflineSupported() {
  return (
    typeof window !== "undefined" &&
    isTauri() &&
    navigator.userAgent.includes("Mac")
  )
}

export async function initializeOfflineStore() {
  if (!manifestLoad) {
    manifestLoad = (async () => {
      if (isDesktopOfflineSupported()) {
        const stored = await readNamespacedValue(offlineManifestKey())
        manifest = normalizeManifest(stored)
      }
      manifestLoaded = true
      emit(manifestListeners)
      return manifest
    })()
  }

  await manifestLoad
  return manifest
}

export function isOfflineStoreLoaded() {
  return manifestLoaded
}

export function getOfflineManifest() {
  return manifest
}

export function subscribeOfflineManifest(listener: () => void) {
  manifestListeners.add(listener)
  return () => {
    manifestListeners.delete(listener)
  }
}

export async function updateOfflineManifest(
  update: (current: OfflineManifest) => OfflineManifest,
) {
  const current = await initializeOfflineStore()
  manifest = normalizeManifest(update(current))
  await set(offlineManifestKey(), manifest)
  emit(manifestListeners)
  return manifest
}

export async function enableOfflineWorkspace(input: {
  accountId: string
  session: OfflineSessionSnapshot
  workspace: Omit<OfflineWorkspace, "enabledAt">
}) {
  return updateOfflineManifest((current) => ({
    ...current,
    accountId: input.accountId,
    session: input.session,
    workspaces: [
      ...current.workspaces.filter((item) => item.id !== input.workspace.id),
      { ...input.workspace, enabledAt: new Date().toISOString() },
    ],
  }))
}

export async function disableOfflineWorkspace(workspaceId: string) {
  const current = await initializeOfflineStore()
  const pages = current.items.filter(
    (item) => item.workspaceId === workspaceId && item.kind === "page",
  )
  if (pages.some((item) => item.dirty || item.blocked)) {
    throw new Error("Sync, export, or discard local drafts before removing this workspace.")
  }
  await Promise.all(
    pages.map((item) => clearOfflineDocumentDatabase(workspaceId, item.id)),
  )
  return updateOfflineManifest((current) => ({
    ...current,
    items: current.items.filter((item) => item.workspaceId !== workspaceId),
    workspaces: current.workspaces.filter((item) => item.id !== workspaceId),
  }))
}

export async function setOfflineItem(item: OfflineItem) {
  return updateOfflineManifest((current) => ({
    ...current,
    items: [
      ...current.items.filter(
        (candidate) =>
          candidate.kind !== item.kind || candidate.id !== item.id,
      ),
      item,
    ],
  }))
}

export async function patchOfflineItem(
  kind: OfflineItemKind,
  id: string,
  patch: Partial<OfflineItem>,
) {
  return updateOfflineManifest((current) => ({
    ...current,
    items: current.items.map((item) =>
      item.kind === kind && item.id === id ? { ...item, ...patch } : item,
    ),
  }))
}

export async function removeOfflineItem(kind: OfflineItemKind, id: string) {
  return updateOfflineManifest((current) => ({
    ...current,
    items: current.items.filter(
      (item) => item.kind !== kind || item.id !== id,
    ),
  }))
}

export function getOfflineItem(kind: OfflineItemKind, id: string) {
  return manifest.items.find((item) => item.kind === kind && item.id === id)
}

export function hasUnsyncedOfflineItems() {
  return manifest.items.some(
    (item) => item.kind === "page" && (item.dirty || item.blocked),
  )
}

export async function rememberValidatedOfflineSession(
  snapshot: OfflineSessionSnapshot,
  workspaces: Array<{ id: string; name: string; slug: string }>,
) {
  if (!manifest.workspaces.length) return

  await updateOfflineManifest((current) => {
    if (current.accountId && current.accountId !== snapshot.user.id) {
      return current
    }

    const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
    return {
      ...current,
      accountId: snapshot.user.id,
      session: snapshot,
      workspaces: current.workspaces.map((workspace) => ({
        ...workspace,
        ...(byId.get(workspace.id) ?? {}),
      })),
    }
  })
}

export function getValidOfflineSession(now = Date.now()) {
  if (!manifest.accountId || !manifest.session || !manifest.workspaces.length) {
    return null
  }
  if (
    !isOfflineSessionAllowed({
      accountId: manifest.accountId,
      expiresAt: manifest.session.session.expiresAt,
      hasToken: Boolean(getDesktopAuthToken()),
      now,
      ownerId: getDesktopAuthOwner(),
    })
  ) {
    return null
  }
  return manifest.session
}

export function isOfflineSessionAllowed(input: {
  accountId: string
  expiresAt: string
  hasToken: boolean
  now: number
  ownerId: string | null
}) {
  return (
    input.hasToken &&
    input.ownerId === input.accountId &&
    new Date(input.expiresAt).getTime() > input.now
  )
}

export async function clearAllOfflineData() {
  const current = await initializeOfflineStore()
  const pageDatabaseNames = current.items
    .filter((item) => item.kind === "page")
    .map((item) => offlineDocumentName(item.workspaceId, item.id))

  await Promise.all(pageDatabaseNames.map(deleteIndexedDatabase))
  await Promise.all([del(offlineManifestKey()), del(offlineQueryCacheKey())])
  manifest = emptyManifest()
  emit(manifestListeners)
}

export async function clearDesktopServerIndexedData(server?: DesktopServer | null) {
  if (!server) {
    await clearAllOfflineData()
  } else {
    await Promise.all([
      del(offlineManifestKey(server)),
      del(offlineQueryCacheKey(server)),
    ])
  }
  if (typeof indexedDB.databases !== "function") return

  const databases = await indexedDB.databases()
  const originPrefix = server
    ? `zilobase:v1:${encodeURIComponent(server.apiOrigin)}:`
    : "zilobase:v1:"
  const names = databases.flatMap((database) =>
    database.name?.startsWith(originPrefix) ? [database.name] : [],
  )
  await Promise.all(names.map(deleteIndexedDatabaseStrict))
}

export function offlineDocumentName(workspaceId: string, pageId: string) {
  const accountId = manifest.accountId ?? "unknown"
  const origin = encodeURIComponent(manifest.apiOrigin)
  return `zilobase:v1:${origin}:${accountId}:${workspaceId}:${pageId}`
}

export function clearOfflineDocumentDatabase(workspaceId: string, pageId: string) {
  return deleteIndexedDatabase(offlineDocumentName(workspaceId, pageId))
}

export const offlineQueryPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    if (!isDesktopOfflineSupported() || !manifest.workspaces.length) return
    await set(offlineQueryCacheKey(), client)
  },
  restoreClient: async () => {
    if (!isDesktopOfflineSupported() || !manifest.workspaces.length) return
    return (await readNamespacedValue<PersistedClient>(offlineQueryCacheKey())) ?? undefined
  },
  removeClient: () => del(offlineQueryCacheKey()),
}

export function shouldPersistOfflineQuery(query: Query) {
  return shouldPersistOfflineQueryForManifest(query, manifest)
}

export function shouldPersistOfflineQueryForManifest(
  query: Pick<Query, "queryKey" | "state">,
  current: OfflineManifest,
) {
  if (query.state.status !== "success") return false

  const [root, id, detail, fourth] = query.queryKey
  const enabledWorkspaces = new Set(current.workspaces.map((item) => item.id))
  const pages = new Set(
    current.items
      .flatMap((item) =>
        item.kind === "page"
          ? [item.id]
          : item.pageId
            ? [item.pageId]
            : [],
      ),
  )
  const databases = new Set(
    current.items
      .filter((item) => item.kind === "database")
      .map((item) => item.id),
  )

  if (root === "user-settings") return true
  if (root === "pages") {
    return enabledWorkspaces.has(String(id)) && detail === "nav" && fourth === "active"
  }
  if (root === "page") {
    return pages.has(String(id)) && (detail === undefined || detail === "properties")
  }
  if (root === "database") {
    return databases.has(String(id)) && detail === "full"
  }
  if (root === "page-layouts" && id === "resolved") {
    return pages.has(String(detail)) || databases.has(String(fourth))
  }

  return false
}

export function getConnectivityState() {
  return connectivity
}

export function subscribeConnectivity(listener: () => void) {
  connectivityListeners.add(listener)
  return () => {
    connectivityListeners.delete(listener)
  }
}

export function setConnectivityState(state: ConnectivityState) {
  if (connectivity === state) return
  connectivity = state
  emit(connectivityListeners)
}

export function isOfflineMode() {
  return (
    isDesktopOfflineSupported() &&
    (connectivity === "offline" || connectivity === "service-unavailable")
  )
}

export function bytesToBase64(value: Uint8Array) {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

export function base64ToBytes(value: string) {
  const binary = window.atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function normalizeManifest(value: unknown): OfflineManifest {
  if (!value || typeof value !== "object") return emptyManifest()
  const candidate = value as Partial<OfflineManifest>

  if (
    candidate.schemaVersion !== OFFLINE_SCHEMA_VERSION ||
    candidate.apiOrigin !== getOfflineApiOrigin() ||
    !Array.isArray(candidate.items) ||
    !Array.isArray(candidate.workspaces)
  ) {
    return emptyManifest()
  }

  return {
    accountId: typeof candidate.accountId === "string" ? candidate.accountId : null,
    apiOrigin: getOfflineApiOrigin(),
    items: candidate.items.filter(isOfflineItem),
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    session: isOfflineSession(candidate.session) ? candidate.session : null,
    workspaces: candidate.workspaces.filter(isOfflineWorkspace),
  }
}

function isOfflineItem(value: unknown): value is OfflineItem {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<OfflineItem>
  return (
    (item.kind === "page" || item.kind === "database") &&
    typeof item.id === "string" &&
    typeof item.workspaceId === "string" &&
    typeof item.name === "string" &&
    typeof item.availableAt === "string"
  )
}

function isOfflineWorkspace(value: unknown): value is OfflineWorkspace {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<OfflineWorkspace>
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.slug === "string" &&
    typeof item.enabledAt === "string"
  )
}

function isOfflineSession(value: unknown): value is OfflineSessionSnapshot {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<OfflineSessionSnapshot>
  return Boolean(
    item.session &&
      item.user &&
      typeof item.validatedAt === "string" &&
      typeof item.session.expiresAt === "string" &&
      typeof item.user.id === "string",
  )
}

function deleteIndexedDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.addEventListener("success", () => resolve())
    request.addEventListener("error", () => resolve())
    request.addEventListener("blocked", () => resolve())
  })
}

function deleteIndexedDatabaseStrict(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    const timeout = window.setTimeout(
      () => reject(new Error("Local document storage is still in use.")),
      3_000,
    )
    request.addEventListener("success", () => {
      window.clearTimeout(timeout)
      resolve()
    })
    request.addEventListener("error", () => {
      window.clearTimeout(timeout)
      reject(request.error ?? new Error("Local document storage could not be deleted."))
    })
  })
}

function emit(listeners: Set<() => void>) {
  listeners.forEach((listener) => listener())
}

function getOfflineApiOrigin() {
  return resolveRuntimeApiOrigin()
}
