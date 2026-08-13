import {
  clearDesktopAuthToken,
  getDesktopAuthToken,
  setDesktopAuthToken,
} from "@/lib/desktop-auth-token"
import {
  isDesktopOfflineSupported,
  isOfflineMode,
  setConnectivityState,
} from "@/lib/offline-store"

const HOSTED_API_BASE_URL = "https://api.zilobase.com"

export const API_BASE_URL = resolveApiBaseUrl()

declare global {
  interface Window {
    __ZILOBASE_MOBILE_AUTH_COOKIE__?: string
  }
}

type ApiFetchOptions = RequestInit & {
  auth?: boolean
  timeoutMs?: number
}

type ApiErrorBody = {
  code?: string
  error?: string | { message?: string }
  message?: string
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

export class NetworkUnavailableError extends Error {
  constructor(message = "Zilobase is offline. This action requires a connection.") {
    super(message)
    this.name = "NetworkUnavailableError"
  }
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return "Something went wrong. Please try again."
}

export async function apiFetch<T>(
  path: string,
  { auth = true, headers, body, timeoutMs, ...init }: ApiFetchOptions = {},
) {
  const method = (init.method ?? "GET").toUpperCase()
  if (
    isDesktopOfflineSupported() &&
    isOfflineMode() &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    throw new NetworkUnavailableError()
  }

  const requestHeaders = getApiRequestHeaders(headers)

  if (body && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json")
  }

  const requestTimeout = createRequestTimeout(init.signal, timeoutMs)
  let response: Response
  try {
    response = await fetch(toApiUrl(path), {
      ...init,
      body,
      credentials: auth ? "include" : "same-origin",
      headers: requestHeaders,
      signal: requestTimeout.signal,
    })
  } catch (error) {
    if (requestTimeout.didTimeout()) {
      throw new NetworkUnavailableError("Zilobase did not respond in time.")
    }
    if (isRequestAbort(error)) {
      throw error
    }

    if (isDesktopOfflineSupported()) {
      setConnectivityState(
        navigator.onLine === false ? "offline" : "service-unavailable",
      )
      throw new NetworkUnavailableError(
        error instanceof Error ? error.message : undefined,
      )
    }
    throw error
  } finally {
    requestTimeout.cleanup()
  }

  if (isDesktopOfflineSupported()) {
    // Any HTTP response proves the service is reachable. Individual 5xx errors
    // must not tear down live sockets and put the whole desktop app offline.
    setConnectivityState("online")
    if (response.status === 401) {
      window.dispatchEvent(new Event("zilobase:authentication-required"))
    }
  }

  const desktopAuthToken = response.headers.get("set-auth-token")
  if (desktopAuthToken) await setDesktopAuthToken(desktopAuthToken)

  const text = await response.text()
  const data = text ? parseJson(text) : null

  if (!response.ok) {
    throw new ApiError(readErrorMessage(data, response.status), response.status, data)
  }

  return data as T
}

function createRequestTimeout(signal: AbortSignal | null | undefined, timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0) {
    return {
      cleanup: () => undefined,
      didTimeout: () => false,
      signal: signal ?? undefined,
    }
  }

  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(signal?.reason)

  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener("abort", abortFromCaller, { once: true })

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  return {
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abortFromCaller)
    },
    didTimeout: () => timedOut,
    signal: controller.signal,
  }
}

export function isRequestAbort(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  )
}

export function getApiRequestHeaders(headers?: HeadersInit) {
  const requestHeaders = new Headers(headers)
  const mobileViewerCookie = readEmbeddedMobileAuthCookie()
  const desktopAuthToken = getDesktopAuthToken()

  if (desktopAuthToken && !requestHeaders.has("authorization")) {
    requestHeaders.set("authorization", `Bearer ${desktopAuthToken}`)
  }

  if (mobileViewerCookie && !requestHeaders.has("x-mobile-auth-cookie")) {
    requestHeaders.set("x-mobile-auth-cookie", mobileViewerCookie)
  }

  return requestHeaders
}

export async function clearApiAuthToken() {
  await clearDesktopAuthToken()
}

export function authFetch<T>(path: string, body?: unknown, init?: RequestInit) {
  return apiFetch<T>(`/api/auth${path}`, {
    ...init,
    method: init?.method ?? "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function toApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return API_BASE_URL
    ? `${API_BASE_URL}${normalizedPath}`
    : normalizedPath
}

export function resolveApiBaseUrl(
  location = typeof window !== "undefined" ? window.location : undefined,
) {
  if (
    location?.protocol === "tauri:" ||
    location?.hostname === "tauri.localhost"
  ) {
    return import.meta.env.DEV ? "" : HOSTED_API_BASE_URL
  }

  if (
    location?.hostname === "app.zilobase.com"
  ) {
    return ""
  }

  const configuredBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "")

  if (configuredBaseUrl && configuredBaseUrl !== "/api") {
    return configuredBaseUrl
  }

  return ""
}

function readEmbeddedMobileAuthCookie() {
  if (typeof window === "undefined") {
    return null
  }

  const cookie = window.__ZILOBASE_MOBILE_AUTH_COOKIE__

  return typeof cookie === "string" && cookie.trim() ? cookie : null
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function readErrorMessage(body: unknown, status: number) {
  if (typeof body === "string" && body.trim()) {
    return body
  }

  if (body && typeof body === "object") {
    const errorBody = body as ApiErrorBody

    if (typeof errorBody.message === "string") {
      return errorBody.message
    }

    if (typeof errorBody.error === "string") {
      return errorBody.error
    }

    if (errorBody.error?.message) {
      return errorBody.error.message
    }
  }

  if (status === 401) {
    return "Please sign in to continue."
  }

  return "Something went wrong. Please try again."
}
