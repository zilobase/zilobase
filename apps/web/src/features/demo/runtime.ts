import type { DatabasePayload } from "@zilobase/features/databases"
import type { PageDetail } from "@zilobase/features/pages"
import type { UserSettings } from "@zilobase/features/user-settings"

import { installDemoTransport } from "./transport"

export const DEMO_SIGNUP_URL = "https://app.zilobase.com/signup"
export const DEMO_START_PATH = "/p/demo-page-start-here"
export const DEMO_GUARD_EVENT = "zilobase:demo-guard"

const databaseSnapshots = new Map<string, DatabasePayload>()
const pageSnapshots = new Map<string, PageDetail>()
const pagePatches = new Map<string, { name?: string; updatedAt: string }>()
let settingsSnapshot: UserSettings | null = null
let mutationSequence = 1

type DemoCache = {
  clear: () => void
  getQueriesData: <T>(filters: {
    queryKey: readonly unknown[]
  }) => Array<[readonly unknown[], T | undefined]>
  getQueryData: <T>(queryKey: readonly unknown[]) => T | undefined
}

let demoCache: DemoCache = {
  clear: () => undefined,
  getQueriesData: () => [],
  getQueryData: () => undefined,
}

export function installDemoCache(cache: DemoCache) {
  demoCache = cache
}

export class DemoGuardError extends Error {
  readonly body = {
    code: "DEMO_READ_ONLY",
    error: "Changes are disabled in the hosted demo.",
  }
  readonly status = 403

  constructor() {
    super("Changes are disabled in the hosted demo.")
    this.name = "DemoGuardError"
  }
}

export function isHostedDemoRuntime(
  location = typeof window !== "undefined" ? window.location : undefined,
) {
  if (!location) return false
  return (
    location.hostname === "demo.zilobase.com" ||
    location.hostname === "demo.localhost"
  )
}

export function isAllowedDemoParent(
  referrer: URL,
  location = typeof window !== "undefined" ? window.location : undefined,
) {
  if (
    referrer.hostname === "zilobase.com" ||
    referrer.hostname === "www.zilobase.com"
  ) {
    return true
  }

  return (
    location?.hostname === "demo.localhost" &&
    ["localhost", "127.0.0.1", "::1"].includes(referrer.hostname)
  )
}

export function requestDemoGuard() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEMO_GUARD_EVENT))
  }
  return new DemoGuardError()
}

export function interceptDemoMutation<T>(
  path: string,
  method: string,
  body: BodyInit | null | undefined,
): { handled: false } | { handled: true; value: T } {
  if (!isHostedDemoRuntime() || method === "GET" || method === "HEAD") {
    return { handled: false }
  }

  const url = toLocalUrl(path)
  const payload = parseBody(body)
  if (
    method === "POST" &&
    url.pathname === "/pages/item-visits" &&
    isRecord(payload) &&
    typeof payload.itemId === "string" &&
    (payload.itemKind === "page" || payload.itemKind === "database")
  ) {
    return {
      handled: true,
      value: {
        itemId: payload.itemId,
        itemKind: payload.itemKind,
        lastVisitedAt: new Date().toISOString(),
      } as T,
    }
  }

  const pageMatch = url.pathname.match(/^\/pages\/([^/]+)$/)
  if (
    method === "PATCH" &&
    pageMatch &&
    isRecord(payload) &&
    Object.keys(payload).every((key) => key === "name") &&
    typeof payload.name === "string"
  ) {
    const pageId = decodeURIComponent(pageMatch[1]!)
    const updatedAt = new Date().toISOString()
    pagePatches.set(pageId, { name: payload.name, updatedAt })
    capturePageSnapshot(pageId)
    return {
      handled: true,
      value: { page: { id: pageId, updatedAt } } as T,
    }
  }

  const pageContentMatch = url.pathname.match(/^\/pages\/([^/]+)\/content$/)
  if (
    method === "PATCH" &&
    pageContentMatch &&
    isRecord(payload) &&
    "content" in payload
  ) {
    const pageId = decodeURIComponent(pageContentMatch[1]!)
    const updatedAt = new Date().toISOString()
    capturePageSnapshot(pageId)
    return {
      handled: true,
      value: { page: { id: pageId, updatedAt } } as T,
    }
  }

  if (
    method === "PATCH" &&
    url.pathname === "/user-settings" &&
    isRecord(payload) &&
    Object.keys(payload).every((key) =>
      ["embeddedItemsOpenAs", "pageFullWidth", "sidebarConfig"].includes(key)
    )
  ) {
    settingsSnapshot = demoCache.getQueryData<UserSettings>(["user-settings"]) ?? null
    return {
      handled: true,
      value: { settings: settingsSnapshot } as T,
    }
  }

  const databaseTarget = readAllowedDatabaseMutation(url.pathname, method, payload)
  if (databaseTarget) {
    const snapshot = captureDatabaseSnapshot(databaseTarget)
    const databaseId = snapshot?.database.id ?? databaseTarget
    const version = (snapshot?.database.version ?? 0) + 1
    if (snapshot) {
      snapshot.database.version = version
      databaseSnapshots.set(databaseId, snapshot)
    }
    const changed = url.pathname.includes("/views/")
      ? ["views"]
      : url.pathname.includes("/properties/")
        ? ["values"]
        : ["rows", "values"]
    return {
      handled: true,
      value: {
        changed,
        committedAt: new Date().toISOString(),
        databaseId,
        delta: {},
        mutationId: `demo-local-${mutationSequence++}`,
        version,
      } as T,
    }
  }

  throw requestDemoGuard()
}

export function applyDemoReadOverlay<T>(path: string, value: T): T {
  if (!isHostedDemoRuntime() || !value || typeof value !== "object") {
    return value
  }

  const url = toLocalUrl(path)
  const databaseMatch = url.pathname.match(/^\/databases\/([^/]+)$/)
  if (databaseMatch) {
    const requestedId = decodeURIComponent(databaseMatch[1]!)
    const existing = findDatabaseSnapshot(requestedId)
    if (existing) return clone(existing) as T

    if (isDatabasePayload(value)) {
      databaseSnapshots.set(value.database.id, clone(value))
    }
    return value
  }

  const pageMatch = url.pathname.match(/^\/pages\/([^/]+)$/)
  if (pageMatch) {
    const pageId = decodeURIComponent(pageMatch[1]!)
    const existing = pageSnapshots.get(pageId)
    if (existing) return clone(existing) as T
    if (isPageDetail(value)) {
      const patched = patchPageDetail(value)
      pageSnapshots.set(pageId, clone(patched))
      return patched as T
    }
  }

  if (url.pathname === "/user-settings") {
    if (settingsSnapshot) {
      return { ...(value as object), settings: clone(settingsSnapshot) } as T
    }
    const settings = (value as { settings?: unknown }).settings
    if (isRecord(settings)) settingsSnapshot = clone(settings as UserSettings)
    return value
  }

  return applyPagePatches(value)
}

export function resetHostedDemo() {
  databaseSnapshots.clear()
  pageSnapshots.clear()
  pagePatches.clear()
  settingsSnapshot = null
  mutationSequence = 1
  demoCache.clear()
  if (typeof window !== "undefined") window.location.assign(DEMO_START_PATH)
}

function readAllowedDatabaseMutation(
  pathname: string,
  method: string,
  payload: unknown,
) {
  const cell = pathname.match(
    /^\/databases\/([^/]+)\/rows\/[^/]+\/properties\/[^/]+$/,
  )
  if (method === "PUT" && cell && isRecord(payload) && "value" in payload) {
    return decodeURIComponent(cell[1]!)
  }

  const move = pathname.match(/^\/databases\/([^/]+)\/rows\/[^/]+\/move$/)
  if (method === "PATCH" && move && isRecord(payload)) {
    return decodeURIComponent(move[1]!)
  }

  const reorder = pathname.match(/^\/databases\/([^/]+)\/rows\/reorder$/)
  if (
    method === "PATCH" &&
    reorder &&
    isRecord(payload) &&
    Array.isArray(payload.rowIds)
  ) {
    return decodeURIComponent(reorder[1]!)
  }

  const view = pathname.match(/^\/databases\/([^/]+)\/views\/[^/]+$/)
  if (
    method === "PATCH" &&
    view &&
    isRecord(payload) &&
    Object.keys(payload).every((key) => key === "config")
  ) {
    return decodeURIComponent(view[1]!)
  }

  return null
}

function captureDatabaseSnapshot(targetId: string) {
  const cached = demoCache
    .getQueriesData<DatabasePayload | null>({ queryKey: ["database"] })
    .map(([, value]) => value)
    .find(
      (value) =>
        value &&
        (value.database.id === targetId ||
          value.activeDataSource?.id === targetId ||
          value.dataSources.some((source) => source.id === targetId)),
    )
  if (!cached) return findDatabaseSnapshot(targetId)
  const snapshot = clone(cached)
  databaseSnapshots.set(snapshot.database.id, snapshot)
  return snapshot
}

function findDatabaseSnapshot(targetId: string) {
  const direct = databaseSnapshots.get(targetId)
  if (direct) return direct
  return [...databaseSnapshots.values()].find(
    (snapshot) =>
      snapshot.activeDataSource?.id === targetId ||
      snapshot.dataSources.some((source) => source.id === targetId),
  )
}

function capturePageSnapshot(pageId: string) {
  const cached = demoCache.getQueryData<PageDetail | null>(["page", pageId])
  if (cached) pageSnapshots.set(pageId, clone(patchPageDetail(cached)))
}

function patchPageDetail(detail: PageDetail) {
  const patch = pagePatches.get(detail.page.id)
  return patch ? { ...detail, page: { ...detail.page, ...patch } } : detail
}

function applyPagePatches<T>(value: T): T {
  if (pagePatches.size === 0 || !isRecord(value)) return value
  const next = clone(value) as Record<string, unknown>
  if (Array.isArray(next.pages)) {
    next.pages = next.pages.map((page) => patchPageRecord(page))
  }
  if (Array.isArray(next.rows)) {
    next.rows = next.rows.map((row) =>
      isRecord(row) && isRecord(row.page)
        ? { ...row, page: patchPageRecord(row.page) }
        : row
    )
  }
  if (isRecord(next.page)) next.page = patchPageRecord(next.page)
  return next as T
}

function patchPageRecord(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string") return value
  const patch = pagePatches.get(value.id)
  return patch ? { ...value, ...patch } : value
}

function parseBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return null
  try {
    return JSON.parse(body) as unknown
  } catch {
    return null
  }
}

function toLocalUrl(path: string) {
  return new URL(path, "https://demo.zilobase.com")
}

function isDatabasePayload(value: unknown): value is DatabasePayload {
  return isRecord(value) && isRecord(value.database) && Array.isArray(value.rows)
}

function isPageDetail(value: unknown): value is PageDetail {
  return isRecord(value) && isRecord(value.page) && typeof value.page.id === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

installDemoTransport({
  applyReadOverlay: applyDemoReadOverlay,
  interceptMutation: interceptDemoMutation,
})
